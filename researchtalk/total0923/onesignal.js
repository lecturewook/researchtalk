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
    if (dialogShown || !global.document?.body) return;
    dialogShown = true;

    const overlay = document.createElement('div');
    overlay.id = 'onesignal-verification-modal';
    overlay.setAttribute('role', 'presentation');
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

    const card = document.createElement('section');
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-labelledby', 'onesignal-verification-title');
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

    const title = document.createElement('h2');
    title.id = 'onesignal-verification-title';
    title.textContent = 'Your OneSignal SDK integration is complete!';
    title.style.cssText = 'margin:0 0 10px;font-size:18px;line-height:1.45;';

    const message = document.createElement('p');
    message.textContent = 'You can now send Push Notifications & In-App Messages through OneSignal. Tap below to enable push notifications.';
    message.style.cssText = 'margin:0 0 18px;font-size:13px;line-height:1.7;color:#555;';

    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Got it';
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

    button.addEventListener('click', async function () {
      button.disabled = true;
      try {
        await requestPermission();
      } catch (error) {
        console.warn('[researchtalk] OneSignal permission request failed:', error);
      } finally {
        overlay.remove();
      }
    }, { once: true });

    card.append(title, message, button);
    overlay.append(card);
    document.body.append(overlay);
    button.focus();
  }

  function ensureInitialized() {
    if (initPromise) return initPromise;

    initPromise = new Promise((resolve, reject) => {
      deferred(async function (OneSignal) {
        try {
          sdk = OneSignal;

          const options = {
            appId: APP_ID,
            serviceWorkerPath: SERVICE_WORKER_PATH,
            serviceWorkerParam: { scope: SERVICE_WORKER_SCOPE }
          };

          if (isLocalhost()) {
            options.allowLocalhostAsSecureOrigin = true;
          }

          await OneSignal.init(options);

          // 초기화 직후 구독 변경 관찰자를 설치하고 현재 상태도 즉시 확인합니다.
          installSubscriptionObserver();

          // Web에서는 권한 승인 전 Subscription ID가 보통 없으므로,
          // 초기화 완료 뒤 확인창을 먼저 보여주고 Got it에서만 권한을 요청합니다.
          showVerificationDialog();

          resolve(OneSignal);
        } catch (error) {
          console.error('[researchtalk] OneSignal initialization failed:', error);
          reject(error);
        }
      });
    });

    return initPromise;
  }

  async function requestPermission() {
    const OneSignal = await ensureInitialized();

    if (!OneSignal.Notifications.isPushSupported()) {
      console.warn('[researchtalk] This browser does not support web push.');
      return false;
    }

    await OneSignal.Notifications.requestPermission();
    confirmRegistration();
    return OneSignal.Notifications.permission === true;
  }

  async function login(externalId) {
    const id = String(externalId || '').trim();
    if (!id || id === currentExternalId) return;

    const OneSignal = await ensureInitialized();
    await OneSignal.login(id);
    currentExternalId = id;
  }

  async function logout() {
    if (!currentExternalId) return;

    const OneSignal = await ensureInitialized();
    await OneSignal.logout();
    currentExternalId = null;
  }

  async function syncUser(externalId) {
    const id = externalId ? String(externalId).trim() : '';

    if (id) {
      await login(id);
      return;
    }

    if (currentExternalId) {
      await logout();
    }
  }

  async function addEmail(email) {
    const value = String(email || '').trim();
    if (!value) return;
    const OneSignal = await ensureInitialized();
    OneSignal.User.addEmail(value);
  }

  async function addSms(phone) {
    const value = String(phone || '').trim();
    if (!value) return;
    const OneSignal = await ensureInitialized();
    OneSignal.User.addSms(value);
  }

  async function addTag(key, value) {
    const tagKey = String(key || '').trim();
    if (!tagKey) return;
    const OneSignal = await ensureInitialized();
    OneSignal.User.addTag(tagKey, String(value ?? ''));
  }

  global.RTOneSignal = Object.freeze({
    init: ensureInitialized,
    login,
    logout,
    syncUser,
    requestPermission,
    addEmail,
    addSms,
    addTag,
    subscriptionId: getRealSubscriptionId
  });

  // SDK 초기화는 가능한 한 일찍 한 번만 수행합니다.
  ensureInitialized().catch(() => {});

})(window);
