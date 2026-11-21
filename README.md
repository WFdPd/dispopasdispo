# dispoPASdispo — application installable (PWA)

Site statique (GitHub Pages) + Firebase (Authentication e-mail/mot de passe + Firestore).

## Mise en route
1. **Firebase → Authentication → Sign-in method** : activer *E-mail/Mot de passe*.
2. **Firebase → Firestore → Règles** : coller le contenu de `firestore.rules`, puis *Publier*.
3. **GitHub** : dépôt avec ces fichiers à la racine, puis *Settings → Pages → Deploy from a branch → main / (root)*.
4. **Firebase → Authentication → Settings → Domaines autorisés** : ajouter `VOTRE-COMPTE.github.io`.
5. **Premier compte agence (fondateur)** — dans Firestore (console), créer à la main :
   - collection `staff`, document dont l'ID est votre téléphone à 10 chiffres (ex. `0612345678`) :
     `nom` (string), `prenom` (string), `tel` (string, même valeur), `uid` (null), `registered` (boolean false)
   - collection `activation`, même ID : `code` (string, 8 caractères parmi A-Z sans I/L/O + 2-9, ex. `K7M49PXQ`),
     `expires` (timestamp, dans moins de 7 jours… ou plus tard), `kind` (string `staff`)
   - dans l'application : *Créer mon compte* avec ce téléphone + ce code + un mot de passe.
6. Ensuite, tout se fait dans l'application (onglet *Intérimaires*).

## Installer sur téléphone
iPhone (Safari) : Partager → Sur l'écran d'accueil. Android (Chrome) : ⋮ → Installer l'application.

## Sécurité
- La clé Firebase du code est publique par conception ; la protection repose sur les règles Firestore.
- Recommandé : Google Cloud Console → Identifiants → restreindre la clé aux référents HTTP `https://VOTRE-COMPTE.github.io/*`.
- Pas de blocage serveur des tentatives de code : compensé par un code de 8 caractères valable 7 jours.
- Pièce d'identité : seuls les 3 derniers caractères sont conservés.
