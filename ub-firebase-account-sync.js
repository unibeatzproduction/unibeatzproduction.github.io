// UB FIREBASE ACCOUNT SYNC
// Shared across UniFreestyle, UniPack, Radio, Future Platforms

(function () {
  'use strict';

  function read(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key) || fallback);
    } catch {
      return JSON.parse(fallback);
    }
  }

  function write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  }

  function cleanUsername(str) {
    return String(str || '')
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '');
  }

  async function syncAccount() {
    try {
      const fb = window.UB_FIREBASE || {};

      if (!fb.auth) return;

      const authUser = fb.auth.currentUser;

      if (!authUser) return;

      let username = 'user';

      const localProfile =
        read('ub_current_user', 'null') ||
        read('ub_user', 'null') ||
        {};

      if (localProfile.username) {
        username = cleanUsername(localProfile.username);
      } else if (
        (authUser.displayName || '')
          .toLowerCase()
          .includes('eugene')
      ) {
        username = 'uniiversalallah';
      } else {
        username = cleanUsername(
          (authUser.email || '').split('@')[0]
        );
      }

      const profile = {
        uid: authUser.uid,
        username,
        name:
          localProfile.name ||
          authUser.displayName ||
          'User',
        email: authUser.email || '',
        photo:
          localProfile.photo ||
          authUser.photoURL ||
          '',
        role:
          localProfile.role ||
          'artist',
        bio:
          localProfile.bio ||
          'Built From Pressure.',
        provider: 'google',
        updatedAt: Date.now()
      };

      write('ub_current_user', profile);
      write('ub_user', profile);

      let users =
        read('ub_users', '{}');

      users[username] = profile;

      delete users.djblaze;
      delete users.phantombeats;

      write('ub_users', users);

      if (
        fb.db &&
        fb.doc &&
        fb.setDoc
      ) {
        await fb.setDoc(
          fb.doc(
            fb.db,
            'users',
            authUser.uid
          ),
          profile,
          { merge: true }
        );

        await fb.setDoc(
          fb.doc(
            fb.db,
            'producer_profiles',
            authUser.uid
          ),
          profile,
          { merge: true }
        );

        await fb.setDoc(
          fb.doc(
            fb.db,
            'profiles',
            username
          ),
          profile,
          { merge: true }
        );
      }

      console.log(
        '🔥 UB Account Sync Ready:',
        username
      );

      window.UB_ACCOUNT = profile;

      window.dispatchEvent(
        new CustomEvent(
          'ub-account-ready',
          {
            detail: profile
          }
        )
      );
    } catch (err) {
      console.error(
        'UB Account Sync Error:',
        err
      );
    }
  }

  window.UBAccountSync = {
    syncAccount
  };

  document.addEventListener(
    'DOMContentLoaded',
    () => {
      setTimeout(syncAccount, 1000);
    }
  );

  window.addEventListener(
    'ub-firestore-ready',
    () => {
      setTimeout(syncAccount, 500);
    }
  );

  setInterval(syncAccount, 15000);
})();
