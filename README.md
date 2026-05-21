# unibeatzproduction.github.io
unibeatzproduction Website

## Uni Radio Station (New)

### Pages
- `radio.html` — artist submission + approved radio player.
- `admin-radio.html` — admin moderation dashboard (approve/reject + channel routing).

### Firebase Collections
`radio_submissions/{submissionId}`

```json
{
  "artistName": "string",
  "email": "string",
  "trackTitle": "string",
  "genre": "Hip-Hop | R&B | Trap | Afrobeats | Drill | Lo-Fi | Podcast / Radio Talk",
  "copyrightDeclaration": "string",
  "audioUrl": "string",
  "storagePath": "radio-submissions/<file>",
  "status": "pending | approved | rejected",
  "reviewNotes": "string",
  "approvedFor": ["Uni Radio Live", "Podcast Replay", "Genre Spotlight", "Night Rotation"],
  "createdAt": "timestamp",
  "reviewedAt": "timestamp|null"
}
```

### Firebase Storage Path
- `radio-submissions/<timestamp>-<filename>`

### Recommended Security Rules (summary)
- Public users: create new submissions only.
- Admin users only: update `status`, `reviewNotes`, and `approvedFor`.
- Public read: approved tracks only (or lock all reads and proxy via server if stricter needed).

## Firebase Security Hardening (Required Before Production)

### 1) Admin-only moderation actions
- `admin-radio.html` now checks Firebase Auth state and requires custom claim `admin: true` before loading moderation data or enabling approve/reject flow.
- Public/non-admin users see access denied messaging.

### 2) Firestore rules file
- Use `firebase-firestore.rules` in this repo.
- It enforces:
  - Public create only for valid `pending` submissions.
  - Public read for approved items only.
  - Admin-only update/delete for moderation fields (`status`, `reviewNotes`, `approvedFor`, `reviewedAt`).

### 3) Storage rules file
- Use `firebase-storage.rules` in this repo.
- It enforces on `radio-submissions/**`:
  - Authenticated uploads only.
  - File type must be `audio/*` or `image/*`.
  - Upload size must be under 25MB.
  - Admin-only deletes.

### 4) Step-by-step apply rules
1. Open Firebase Console → Firestore Database → Rules.
2. Replace rules with contents of `firebase-firestore.rules`.
3. Publish rules.
4. Open Firebase Console → Storage → Rules.
5. Replace rules with contents of `firebase-storage.rules`.
6. Publish rules.
7. In Firebase Auth, assign admin claim to trusted accounts only (e.g. via Admin SDK Cloud Function/script).
8. Sign in as admin and verify moderation works in `admin-radio.html`.
9. Verify non-admin users cannot moderate and cannot write approval fields directly.

### 5) Step-by-step admin claim assignment (example flow)
1. Create admin user in Firebase Auth.
2. Use Admin SDK in a secure backend environment to set custom claims `{ admin: true }`.
3. Force token refresh for the user (sign out/in) so `admin-radio.html` sees the updated claim.
4. Confirm admin access succeeds and non-admin access fails.
