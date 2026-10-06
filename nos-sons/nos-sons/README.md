# Nos sons

Une petite appli web pour deux : chaque jour, chacun poste un son Spotify pour l'autre, avec un petit mot et une photo si on veut. Le son de l'autre reste flouté tant qu'on n'a pas posté le sien, et l'onglet « Nos jours » garde tout l'historique dans un calendrier.

Pas de serveur à gérer, pas de build, pas de `npm install` : ce sont juste des fichiers HTML/CSS/JS. Les données (comptes, sons, photos) sont stockées chez **Supabase**, et le site est hébergé gratuitement sur **GitHub Pages** (ou Netlify).

Compte environ 20 minutes pour tout mettre en place la première fois.

---

## Ce qu'il y a dans le dossier

| Fichier | À quoi il sert |
|---|---|
| `index.html` | La page (presque vide, tout est généré par `app.js`) |
| `app.js` | Toute la logique de l'appli, découpée en sections commentées |
| `style.css` | Le look. Les couleurs générales sont tout en haut, dans `:root` |
| `config.js` | **Le seul fichier à remplir** : l'adresse et la clé de ton projet Supabase |
| `supabase.sql` | Le script qui crée la base de données et les règles de sécurité |
| `manifest.webmanifest` + `icons/` | Pour installer l'appli sur l'écran d'accueil du téléphone |
| `sw.js` | Le « service worker » qui affiche les notifications, même appli fermée |
| `notifications.sql` | Le script qui active les notifications côté base de données |
| `supabase/functions/notify/index.ts` | La petite fonction serveur qui envoie les notifications |
| `tools/cles.html` | Un outil pour générer les clés des notifications |

---

## Étape 1 : créer le projet Supabase (gratuit)

1. Va sur [supabase.com](https://supabase.com) et crée un compte (avec GitHub, c'est le plus rapide).
2. Clique sur **New project**. Donne-lui un nom (par ex. `nos-sons`), choisis un mot de passe de base de données (garde-le quelque part, mais tu n'en auras pas besoin ici) et la région **West EU (Paris)**.
3. Attends une minute que le projet soit prêt.

Le plan gratuit suffit très largement : 500 Mo de base de données et environ 1 Go pour les photos. L'appli compresse chaque photo (environ 200 Ko), donc vous avez de quoi tenir des années.

## Étape 2 : créer la base de données

1. Dans le menu de gauche, ouvre **SQL Editor**, puis **New query**.
2. Copie tout le contenu de `supabase.sql`, colle-le, et clique sur **Run**.
3. Tu dois voir « Success. No rows returned ». C'est bon.

Ce script crée deux tables (`profiles` et `songs`), un espace privé pour les photos, et les règles de sécurité : seules les personnes connectées peuvent lire, et chacun ne peut modifier que ses propres sons.

## Étape 3 : régler la connexion

Dans **Authentication** > **Sign In / Providers** (le nom exact peut varier un peu selon les mises à jour de Supabase) :

- Vérifie que **Email** est activé.
- Désactive **Confirm email**. Sinon, il faudrait cliquer sur un lien reçu par mail avant de pouvoir se connecter, ce qui est inutile pour une appli à deux.

## Étape 4 : remplir `config.js`

1. Dans Supabase, va dans **Project Settings** > **API Keys** (ou **Data API** pour l'URL).
2. Copie la **Project URL** (du type `https://abcdefgh.supabase.co`).
3. Copie la clé publique : elle s'appelle **anon public** ou **publishable** selon la version de l'interface. Surtout **pas** la clé `service_role` / `secret`.
4. Ouvre `config.js` et remplace les deux `XXXX` :

```js
window.CONFIG = {
  APP_NAME: "Nos sons",           // tu peux changer le nom ici
  SUPABASE_URL: "https://abcdefgh.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOi...",
};
```

Pas d'inquiétude si ce fichier est visible publiquement : cette clé est faite pour ça. Ce sont les règles de l'étape 2 qui protègent vos données.

## Étape 5 (facultatif) : tester sur ton ordi

Ouvrir `index.html` en double-cliquant peut marcher, mais le plus fiable est de lancer un petit serveur local depuis le dossier :

```bash
python3 -m http.server 8000
# puis ouvre http://localhost:8000
```

(Ou `npx serve .` si tu as Node.)

## Étape 6 : mettre le site en ligne

### Option recommandée : GitHub Pages

Gratuit, simple, et tu gardes l'historique de toutes tes modifications, ce qui rend la maintenance facile.

1. Crée un compte sur [github.com](https://github.com) si tu n'en as pas.
2. Clique sur **New repository**, nomme-le `nos-sons`, laisse-le en **Public** (obligatoire pour Pages en gratuit, et sans risque ici), puis **Create repository**.
3. Sur la page du dépôt, clique sur **uploading an existing file** et glisse **tout le contenu du dossier** (les fichiers et le dossier `icons`, pas le dossier parent). Clique sur **Commit changes**.
4. Va dans **Settings** > **Pages**. Dans **Source**, choisis **Deploy from a branch**, branche `main`, dossier `/ (root)`, puis **Save**.
5. Après une à deux minutes, ton site est en ligne à l'adresse `https://ton-pseudo.github.io/nos-sons/`.

Pour modifier l'appli plus tard : modifie le fichier directement sur GitHub (icône crayon) ou ré-uploade-le. Le site se met à jour tout seul en une minute.

### Alternative express : Netlify Drop

1. Va sur [app.netlify.com/drop](https://app.netlify.com/drop).
2. Glisse le dossier entier dans la page.
3. C'est en ligne. Crée un compte Netlify pour garder le site (sinon il expire), et tu pourras changer son adresse en `nos-sons-xxx.netlify.app`.

Pour mettre à jour, il suffit de re-glisser le dossier dans l'onglet **Deploys** du site.

## Étape 7 : la première connexion

1. Ouvre le site, touche **Créer mon compte** avec ton email et un mot de passe.
2. Le tuto se lance : prénom, couleur, explication du principe, comment copier un lien Spotify, et comment ajouter l'appli à l'écran d'accueil.
3. Envoie le lien du site à ta copine (bouton **Partager le lien du site** sur l'écran d'accueil de l'appli). Elle crée son compte de la même façon et fait le tuto à son tour.

On peut revoir le tuto à tout moment en touchant la pastille avec son initiale, en haut à droite.

## Étape 8 : fermer les inscriptions

Une fois vos deux comptes créés, pour que personne d'autre ne puisse s'inscrire :

**Authentication** > **Sign In / Providers** > désactive **Allow new users to sign up**.

---

## Notifications

Deux types de notifications :

- **Quand l'autre poste son son**, tu reçois « Léa a posté son son du jour ». Si tu n'as pas encore posté le tien : « Poste le tien pour le découvrir 👀 ».
- **Un rappel à 20h** si tu n'as pas encore posté, avec « Léa a déjà posté le sien 👀 » quand c'est le cas.

La mise en place prend environ 15 minutes, uniquement depuis le site de Supabase et GitHub.

### Notif 1 : mettre les nouveaux fichiers en ligne et générer les clés

1. Sur GitHub, uploade à la racine du dépôt les fichiers nouveaux ou modifiés : `app.js`, `style.css`, `sw.js`, le dossier `tools`, et `icons/badge-72.png`. **Ne remplace pas ton `config.js`**, il contient déjà tes réglages.
2. Une minute plus tard, ouvre `https://ton-pseudo.github.io/nos-sons/tools/cles.html` et touche **Générer les clés**. Tu obtiens trois valeurs. Garde la page ouverte jusqu'à la fin de la mise en place, car elle ne les conserve pas.
3. Dans ton `config.js` sur GitHub (icône crayon), ajoute une ligne avec ta clé publique, juste avant le `};` :

```js
  VAPID_PUBLIC_KEY: "ta-clé-publique",
```

### Notif 2 : créer la fonction qui envoie les notifications

1. Dans Supabase, menu **Edge Functions** > **Deploy a new function** > **Via Editor**.
2. Nomme-la exactement `notify`, remplace tout le code d'exemple par le contenu de `supabase/functions/notify/index.ts`, puis clique sur **Deploy**.
3. Dans les réglages de la fonction (onglet **Details** ou **Settings**), désactive **Verify JWT** (parfois appelé « Enforce JWT verification »), puis enregistre. C'est nécessaire pour que la base de données puisse l'appeler. La fonction est protégée par ton `NOTIFY_SECRET` à la place.
4. Va dans **Edge Functions** > **Secrets** et ajoute ces quatre secrets :

| Nom | Valeur |
|---|---|
| `VAPID_PUBLIC_KEY` | la clé publique générée |
| `VAPID_PRIVATE_KEY` | la clé privée générée |
| `NOTIFY_SECRET` | le secret généré |
| `VAPID_SUBJECT` | `mailto:` suivi de ton email, par ex. `mailto:matys@exemple.fr` |

Facultatif : ajoute `REMINDER_HOUR` avec une autre valeur que `20` pour changer l'heure du rappel (heure de Paris).

### Notif 3 : brancher la base de données

1. Ouvre `notifications.sql` dans un éditeur de texte.
2. Remplace `TON_PROJET` (2 fois) par l'identifiant de ton projet : c'est le `abcdefgh` de ton adresse `https://abcdefgh.supabase.co`.
3. Remplace `TON_SECRET` (2 fois) par ton `NOTIFY_SECRET`.
4. Colle le tout dans **SQL Editor** > **New query** > **Run**.

Si Supabase refuse `create extension pg_cron`, active **Cron** dans **Integrations**, puis relance le script.

### Notif 4 : activer sur chaque téléphone

1. **Sur iPhone**, il faut que l'appli soit ajoutée à l'écran d'accueil et ouverte depuis là (iOS 16.4 minimum). Dans Safari, ça ne marchera pas.
2. Ouvre l'appli : un bandeau propose **Activer**. Accepte la demande du téléphone.
3. Touche ta pastille en haut à droite > **Envoyer une notif de test**. Si elle arrive, tout fonctionne.

À faire chacun sur son téléphone.

### Si ça ne marche pas

- **La notif de test n'arrive pas** : dans Supabase, ouvre **Edge Functions** > `notify` > **Logs** pour voir l'erreur. Le plus souvent, c'est un secret mal copié (espace en trop) ou Verify JWT encore activé.
- **Le test marche mais pas les notifs quand l'autre poste** : vérifie que `TON_PROJET` et `TON_SECRET` sont bien remplacés dans `notifications.sql` et relance-le. Les appels de la base sont visibles dans **Table Editor** > schéma `net` > `_http_response`.
- **Pour tester le rappel sans attendre 20h** : dans **SQL Editor**, lance cette requête (avec tes valeurs) :

```sql
select net.http_post(
  url := 'https://TON_PROJET.supabase.co/functions/v1/notify',
  headers := '{"Content-Type": "application/json", "x-notify-secret": "TON_SECRET"}'::jsonb,
  body := '{"type": "reminder", "force": true}'::jsonb
);
```

## Bon à savoir

**Mise en pause Supabase.** Sur le plan gratuit, un projet qui n'est utilisé par personne pendant 7 jours est mis en pause. Comme vous postez chaque jour, ça ne devrait pas arriver. Si vous partez en vacances sans l'appli, il suffira de cliquer sur **Restore project** dans Supabase en rentrant : les données ne sont pas perdues.

**Le lien Spotify.** L'appli utilise deux outils publics de Spotify qui ne demandent ni clé ni compte développeur : l'« oEmbed » (pour récupérer titre et pochette) et le lecteur intégré. « Ouvrir dans Spotify » ouvre directement l'appli Spotify sur téléphone. Ça marche aussi pour un album, une playlist ou un épisode de podcast.

**L'heure du « jour ».** Un jour commence à minuit, à l'heure du téléphone de chacun.

**Mot de passe oublié.** Dans Supabase : **Authentication** > **Users**, clique sur l'utilisateur, puis **Send password recovery** (il faudra alors renseigner l'adresse du site dans **Authentication** > **URL Configuration** > **Site URL**). Le plus simple reste de choisir un mot de passe que vous retiendrez.

## Modifier l'appli

- **Couleurs du fond, du texte, etc.** : en haut de `style.css`, dans `:root` (et juste en dessous pour le mode sombre).
- **Couleurs proposées dans le tuto** : le tableau `COLORS` en haut de `app.js`.
- **Textes du tuto** : la fonction `renderOnboarding` dans `app.js`.
- **Règle du son flouté** : la fonction `canSee` dans `app.js`.
- **Taille / qualité des photos** : la fonction `compressImage` dans `app.js`.
- **Textes des notifications** : `supabase/functions/notify/index.ts` (pense à redéployer la fonction après modification).
