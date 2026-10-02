import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { JaaSMeeting } from '@jitsi/react-sdk';
import { supabase } from './supabaseClient';

export const VideoRoom = memo(function VideoRoom({ lesson, isObserver = false, isTeacher = false }) {
  const [meeting, setMeeting] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    const loadMeeting = async () => {
      if (!lesson?.id) return;
      setLoading(true);
      setError('');

      // Одна комната для всех, кто в этом уроке — по lesson.id
      const roomName = `chess-lesson-${lesson.id}`;

      const { data, error: functionError } = await supabase.functions.invoke('jitsi-token', {
        body: { roomName, isModerator: !isObserver && isTeacher },
      });

      if (cancelled) return;

      if (functionError || !data?.jwt || !data?.appId) {
        console.error('Ошибка Jitsi JWT:', functionError || data);
        setError('Не удалось подключиться к видеозвонку');
        setLoading(false);
        return;
      }

      setMeeting({
        appId: data.appId,
        roomName: data.roomName || roomName,
        jwt: data.jwt,
      });
      setLoading(false);
    };

    loadMeeting();
    return () => {
      cancelled = true;
    };
  }, [lesson?.id, isObserver, isTeacher]);

  const configOverwrite = useMemo(
    () => ({
      p2p: { enabled: false },
      prejoinConfig: { enabled: false },
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

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-900 text-gray-300 text-xs">
        Подключение к видеозвонку...
      </div>
    );
  }

  if (error || !meeting) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-gray-900 text-gray-300 text-xs">
        <p>{error || 'Видеозвонок недоступен'}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white cursor-pointer"
        >
          Переподключиться
        </button>
      </div>
    );
  }

  return (
    <JaaSMeeting
      appId={meeting.appId}
      roomName={meeting.roomName}
      jwt={meeting.jwt}
      configOverwrite={configOverwrite}
      interfaceConfigOverwrite={interfaceConfigOverwrite}
      getIFrameRef={setIframe}
    />
  );
});