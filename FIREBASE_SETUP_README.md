# Wakala Point — Firebase Setup (Authentication + Realtime Database)

Umebadilishwa kutoka localStorage kwenda **Firebase Authentication** (kuingia/kujiandikisha) na **Firebase Realtime Database** (kuhifadhi maombi na taarifa za mtumiaji). Kila kitu kingine kwenye app kinafanya kazi vile vile.

Umetumia **Email/Password** na **Continue with Google** badala ya Phone Auth, kwa sababu Phone Auth inahitaji mpango wa malipo (Blaze) wa Firebase. Email na Google ni bure kwenye mpango wa Spark (free).

## Hatua za kuwezesha (lazima zifanyike kwenye Firebase Console)

### 1. Wezesha Authentication

1. Fungua **console.firebase.google.com** → mradi wako `wakalapoint-1b62d`.
2. Kushoto: **Build → Authentication** → **Get started**.
3. Tab ya **Sign-in method** → bonyeza **Email/Password** → **Enable** → Save.
4. Bonyeza **Google** → **Enable** → chagua "Project support email" (barua pepe yako) → Save.

### 2. Wezesha Realtime Database

1. Kushoto: **Build → Realtime Database** → **Create Database**.
   - Chagua eneo lolote (location).
   - Anza na **"Start in locked mode"**.
2. Tab ya **Rules** → futa kilichopo → bandika maudhui ya faili `database.rules.json` (imejumuishwa kwenye zip hii) → **Publish**.
3. Hakikisha **databaseURL** kwenye `firebase-init.js` inalingana na database uliyounda (kwa kawaida `https://wakalapoint-1b62d-default-rtdb.firebaseio.com`; ikiwa Firebase ilikupa URL tofauti, ibandike hapo).

### 3. Kwa "Continue with Google" — weka domain yako kwenye orodha ya ruhusa

Kwenye **Authentication → Settings → Authorized domains**, hakikisha domain unayotumia kuhost app (mfano `wakalapoint.com`, au `localhost` kwa majaribio) imeorodheshwa. Firebase huongeza `localhost` na `*.firebaseapp.com` kiotomatiki.

Hilo ndilo tu linalohitajika — hakuna server, hakuna terminal.

## Nini kilibadilika

- **`firebase-init.js`** — sasa inaanzisha Firebase Authentication (Email/Password + Google) pamoja na Realtime Database.
- **`wakala.js`**:
  - `registerUser({ jina, simu, mkoa, email, pass })` — inatumia `createUserWithEmailAndPassword`, kisha inahifadhi `jina`/`simu`/`mkoa` kwenye Realtime Database chini ya `users/{uid}`.
  - `loginUser(email, pass)` — inatumia `signInWithEmailAndPassword`.
  - `loginWithGoogle()` — inatumia `signInWithPopup` na Google provider; mtumiaji wa kwanza-kabisa anapata profaili mpya kwenye database otomatiki.
  - `logout()` — sasa inatoa mtumiaji kwenye Firebase Auth (`signOut`) pamoja na kufuta session ya kwenye simu.
  - Namba ya simu (`simu`) bado ipo — ni sehemu ya profaili (kwenye fomu ya register), lakini si tena ndiyo inayotumika kuingia.
- **`login.html`** — sasa ina fomu ya Barua Pepe + Nenosiri, na kitufe cha "Ingia na Google".
- **`register.html`** — sasa ina sehemu ya Barua Pepe (pamoja na Jina/Simu/Mkoa/Nenosiri zilizopo), na kitufe cha "Jiandikishe na Google".
- Vitufe vya "Demo ya Haraka" bado vinafanya kazi vile vile — bado havihitaji akaunti ya kweli.

## Muundo wa Data (Realtime Database)

```
wakalapoint-1b62d-default-rtdb
├── users
│   └── {uid}                      ← uid hii ni ile inayotolewa na Firebase Authentication
│       ├── id, jina, simu, mkoa, email, isAdmin, createdAt
└── requests
    └── {pushId}
        ├── id (WP...), userId (= uid), userName, userPhone, type
        ├── details {...}
        ├── status, tarehe, updatedAt, adminNote
```

## Akaunti ya Admin

Jiandikishe kawaida (kupitia email au Google) kupitia `register.html` au `login.html`. Kisha kwenye Firebase Console → Realtime Database → Data, tafuta `users/{uid-yako}` (utaipata kwa kuangalia barua pepe/jina lako), na badilisha `isAdmin` kutoka `false` kwenda `true`. Mara ujapoingia tena, utapelekwa kwenye `admin.html`.

Vitufe vya "Demo ya Haraka" (Mteja/Admin) bado vinafanya kazi bila akaunti ya kweli — vizuri kwa majaribio ya haraka ya UI.

## Kuhusu usalama wa rules

Rules za sasa (`database.rules.json`) zinahitaji mtumiaji awe ameingia (auth != null) kabla ya kusoma au kuandika, na kila mtumiaji anaweza kuandika profaili yake mwenyewe pekee. Maombi (`requests`) bado yanaweza kusomwa/kuandikwa na mtumiaji yeyote aliyeingia — hii inahitajika kwa sababu admin panel (`admin.html`) lazima isome/ibadilishe maombi ya watumiaji wote, na hakuna seva ya kati (backend) ya kuangalia ni nani hasa admin. Ukitaka ulinzi mkali zaidi (mfano admin tu aweze kubadilisha status), hilo linahitaji **Firebase Custom Claims**, ambayo inahitaji Cloud Functions (seva) — niko tayari kukusaidia hilo ukitaka hatua inayofuata.

