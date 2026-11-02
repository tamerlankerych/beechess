// src/VideoRoom.jsx
import { memo, useCallback, useMemo, useState, useEffect } from 'react';
import { JitsiMeeting } from '@jitsi/react-sdk';
import { supabase } from './supabaseClient';

export const VideoRoom = memo(function VideoRoom({ lesson, isObserver = false, isTeacher = false, user = {} }) {
  const [jwt, setJwt] = useState(null);
  const [error, setError] = useState(null);

  const roomName = lesson?.id ? `chess-lesson-${lesson.id}` : null;

  useEffect(() => {
    if (!roomName) return;
    let isMounted = true;
    
    async function fetchToken() {
      try {
        // Запрашиваем токен у нашей Edge-функции
        const { data, error } = await supabase.functions.invoke('jitsi-token', {
          body: { roomName },
        });
        if (error) throw error;
        if (isMounted) setJwt(data.jwt);
      } catch (err) {
        console.error('Ошибка получения токена Jitsi:', err);
        if (isMounted) setError(err.message);
      }
    }
    
    fetchToken();
    return () => { isMounted = false; };
  }, [roomName]);

  const configOverwrite = useMemo(
    () => ({
      p2p: { enabled: false },
      prejoinPageEnabled: false,
      startWithAudioMuted: isObserver,
      startWithVideoMuted: isObserver,
      disableInviteFunctions: !isTeacher,
      toolbarButtons: isObserver
        ? ['chat', 'fullscreen', 'hangup', 'participants-pane', 'tileview']
        : undefined,
      disableDeepLinking: true,
      enableWelcomePage: false,
    }),
    [isObserver, isTeacher]
  );

  const interfaceConfigOverwrite = useMemo(
    () => ({
      MOBILE_APP_PROMO: false,
      DISABLE_JOIN_LEAVE_NOTIFICATIONS: true,
      SHOW_JITSI_WATERMARK: false,
      SHOW_WATERMARK_FOR_GUESTS: false,
    }),
    []
  );

  const setIframe = useCallback((iframe) => {
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.border = '0';
    iframe.allow = 'camera; microphone; display-capture; autoplay; fullscreen';
  }, []);

  if (!lesson?.id) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-900 text-gray-300 text-xs">
        Урок не найден
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-900 text-red-400 text-xs text-center p-4">
        Ошибка видео: {error}
      </div>
    );
  }

  if (!jwt) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-900 text-gray-400 text-xs animate-pulse">
        Подключение к защищенной комнате...
      </div>
    );
  }

  return (
    <JitsiMeeting
      domain="meet.beechessacademy.com"
      roomName={roomName}
      jwt={jwt} // <--- ВОТ ЭТО ДАЕТ ПРАВА МОДЕРАТОРА
      configOverwrite={configOverwrite}
      interfaceConfigOverwrite={interfaceConfigOverwrite}
      userInfo={{
        displayName: user?.name || (isTeacher ? 'Преподаватель' : 'Ученик'),
        email: user?.email || '',
      }}
      getIFrameRef={setIframe}
    />
  );
});