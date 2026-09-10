import { createClient } from 'npm:@supabase/supabase-js@2';
import { importPKCS8, SignJWT } from 'npm:jose@5.9.6';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const APP_ID = 'vpaas-magic-cookie-1e4727d902c04dcda7d3868088f45281';
const KEY_ID = `${APP_ID}/daff60`;

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authorization = request.headers.get('Authorization');
    if (!authorization) throw new Error('Пользователь не авторизован');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authorization } } }
    );

    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) throw new Error('Недействительная сессия');

    const user = authData.user;
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role, name')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) throw new Error('Профиль пользователя не найден');

    const { roomName } = await request.json();
    if (typeof roomName !== 'string' || !/^chess-lesson-[0-9a-f-]{36}$/i.test(roomName)) {
      throw new Error('Некорректная комната');
    }

    const role = String(profile.role || '').trim().toLowerCase();
    const isTeacher = role === 'teacher';
    const isStudent = role === 'student';
    const isAdmin = role === 'admin';
    if (!isTeacher && !isStudent && !isAdmin) throw new Error('Нет доступа к видеозвонку');

    if (isStudent && roomName !== `chess-lesson-${user.id}`) {
      throw new Error('Ученик не имеет доступа к этой комнате');
    }

    const privateKeyPem = Deno.env.get('JAAS_PRIVATE_KEY')?.replace(/\\n/g, '\n');
    if (!privateKeyPem) throw new Error('На сервере не настроен JAAS_PRIVATE_KEY');

    const privateKey = await importPKCS8(privateKeyPem, 'RS256');
    const now = Math.floor(Date.now() / 1000);

    const jwt = await new SignJWT({
      aud: 'jitsi',
      iss: 'chat',
      sub: APP_ID,
      room: roomName,
      context: {
        user: {
          id: user.id,
          name: profile.name || user.email || (isTeacher ? 'Тренер' : isAdmin ? 'Администратор' : 'Ученик'),
          email: user.email || '',
          moderator: String(isTeacher)
        },
        features: {
          livestreaming: false,
          recording: false,
          transcription: false,
          'outbound-call': false
        },
        room: { regex: false }
      }
    })
      .setProtectedHeader({ alg: 'RS256', kid: KEY_ID, typ: 'JWT' })
      .setNotBefore(now - 10)
      .setExpirationTime(now + 2 * 60 * 60)
      .sign(privateKey);

    return new Response(
      JSON.stringify({ jwt, appId: APP_ID, roomName }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('jitsi-token error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Неизвестная ошибка' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
