import { memo, useCallback, useMemo } from 'react';
import { JitsiMeeting } from '@jitsi/react-sdk';

export const VideoRoom = memo(function VideoRoom({ lesson, isObserver = false, isTeacher = false, user = {} }) {
  if (!lesson?.id) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-900 text-gray-300 text-xs">
        Урок не найден
      </div>
    );
  }

  // Название комнаты на вашем сервере
  const roomName = `chess-lesson-${lesson.id}`;

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

  return (
    <JitsiMeeting
      domain="meet.beechessacademy.com"
      roomName={roomName}
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