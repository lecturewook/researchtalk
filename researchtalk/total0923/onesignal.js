(function (global) {
  'use strict';

  const APP_ID = 'eef4a3f3-5a87-4caa-8eb2-9845e1929832';
  const SERVICE_WORKER_PATH = 'push/onesignal/OneSignalSDKWorker.js';
  const SERVICE_WORKER_SCOPE = '/push/onesignal/';

  let sdk = null;
  let initPromise = null;
  let currentExternalId = null;
  let dialogShown = false;
  let subscriptionChangeHandler = null;

  function deferred(run) {
    global.OneSignalDeferred = global.OneSignalDeferred || [];
    global.OneSignalDeferred.push(run);
  }

  function isLocalhost() {
    return global.location && (
      global.location.hostname === 'localhost' ||
      global.location.hostname === '127.0.0.1'
    );
  }

  function getRealSubscriptionId() {
    const id = sdk?.User?.PushSubscription?.id;
    if (typeof id !== 'string' || !id || id.startsWith('local-')) return null;
    return id;
  }

  function confirmRegistration() {
    const id = getRealSubscriptionId();
    if (!id) return null;

    console.info('[researchtalk] OneSignal push subscription registered:', id);
    global.dispatchEvent(new CustomEvent('researchtalk:push-registered', {
      detail: { subscriptionId: id }
    }));

    return id;
  }

  function installSubscriptionObserver() {
    if (!sdk?.User?.PushSubscription || subscriptionChangeHandler) return;

    subscriptionChangeHandler = function () {
      confirmRegistration();
    };

    sdk.User.PushSubscription.addEventListener(
      'change',
      subscriptionChangeHandler
    );

    // 이미 서버 발급 Subscription ID가 있는 경우도 놓치지 않습니다.
    confirmRegistration();
  }

  function showVerificationDialog() {

  const NOTICE_KEY =
    'researchtalk.onesignalNoticeSeen.v1';


  /* 이미 현재 페이지에서 띄웠으면 중복 방지 */
  if (
    dialogShown ||
    !global.document?.body
  ) {
    return;
  }


  /* 이미 한 번 본 기기에서는 다시 표시하지 않음 */
  try {

    if (
      localStorage.getItem(
        NOTICE_KEY
      ) === '1'
    ) {
      return;
    }

  } catch (_) {}


  /* 이미 알림 권한이 허용되어 있으면 안내창 불필요 */
  if (
    typeof Notification !== 'undefined' &&
    Notification.permission === 'granted'
  ) {

    try {
      localStorage.setItem(
        NOTICE_KEY,
        '1'
      );
    } catch (_) {}

    return;
  }


  dialogShown = true;


  /*
    "한 번만" 표시하기 위해
    처음 보여주는 순간 기록합니다.
  */

  try {
    localStorage.setItem(
      NOTICE_KEY,
      '1'
    );
  } catch (_) {}


  const overlay =
    document.createElement('div');

  overlay.id =
    'onesignal-verification-modal';

  overlay.setAttribute(
    'role',
    'presentation'
  );

  overlay.style.cssText = [
    'position:fixed',
    'inset:0',
    'z-index:2147483646',
    'display:flex',
    'align-items:center',
    'justify-content:center',
    'padding:20px',
    'background:rgba(0,0,0,.42)'
  ].join(';');


  const card =
    document.createElement('section');

  card.setAttribute(
    'role',
    'dialog'
  );

  card.setAttribute(
    'aria-modal',
    'true'
  );

  card.setAttribute(
    'aria-labelledby',
    'onesignal-verification-title'
  );

  card.style.cssText = [
    'width:min(420px,100%)',
    'box-sizing:border-box',
    'background:#fff',
    'border:1px solid #d5d5d5',
    'border-radius:8px',
    'box-shadow:0 18px 48px rgba(0,0,0,.22)',
    'padding:22px',
    'font-family:"Malgun Gothic","맑은 고딕",Arial,sans-serif',
    'color:#202020'
  ].join(';');


  const title =
    document.createElement('h2');

  title.id =
    'onesignal-verification-title';

  title.textContent =
    '새 메시지 알림 기능이 추가되었어요!';

  title.style.cssText =
    'margin:0 0 10px;font-size:18px;line-height:1.5;';


  const message =
    document.createElement('p');

  message.textContent =
    '이제 ResearchTalk에 새 대화가 오면 브라우저와 휴대폰에서 알림을 받을 수 있어요😊👍. 아래 버튼을 눌러 알림을 켜주세요.';

  message.style.cssText =
    'margin:0 0 18px;font-size:13px;line-height:1.75;color:#555;';


  const button =
    document.createElement('button');

  button.type =
    'button';

  button.textContent =
    '알림 켜기';

  button.style.cssText = [
    'display:block',
    'width:100%',
    'min-height:42px',
    'border:0',
    'border-radius:5px',
    'background:#107c41',
    'color:#fff',
    'font:700 13px "Malgun Gothic","맑은 고딕",Arial,sans-serif',
    'cursor:pointer'
  ].join(';');


  button.addEventListener(
    'click',
    async function () {

      button.disabled = true;

      button.textContent =
        '알림 설정 중...';


      try {

        await requestPermission();

      } catch (error) {

        console.warn(
          '[researchtalk] OneSignal permission request failed:',
          error
        );

      } finally {

        overlay.remove();

      }

    },
    {
      once:true
    }
  );


  card.append(
    title,
    message,
    button
  );

  overlay.append(
    card
  );

  document.body.append(
    overlay
  );

  button.focus();
}
