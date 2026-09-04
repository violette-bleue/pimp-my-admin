# ![](icons/icon48.png) Pimp my Admin 

Tu es fondateurice d'un forum forumactif et t'as envie de te simplifier la vie ? 

Pimp my Admin est là pour toi ! Il s'agit d'une extension pour navigateur (uniquement chrome pour le moment) qui permet de synchroniser facilement les templates actuellement en ligne sur ton forum, et ceux disponibles localement sur ta machine — dans un sens, ou dans l'autre.

> ⚠️ L'extension reste non publiée sur le Chrome Store pendant la phase de développement — tu peux l'installer en dev mode nativement en téléchargeant la dernière release.


## Installation

1. Télécharge la dernière version depuis l'onglet [**Releases**](../../releases) de ce repo (`pimp-my-admin_X.X.X.zip`).
2. Dézippe le dossier où tu veux le garder (il doit rester en place : Chrome éxécute l'extension depuis ce dossier).
3. Ouvre `chrome://extensions` depuis la barre d'adresse.
4. Active le **mode développeur** ![](docs/screenshots/devoff.png) → ![](docs/screenshots/devon.png)
5. Clique sur `Charger l'extension non empaquetée` → sélectionne le dossier où tu as dézippé l'extension.

### Alternative : via git (pour rester à jour plus facilement)

Si tu es à l'aise avec git, tu peux cloner directement ce repo au lieu de télécharger un zip à chaque nouvelle version :

```
git clone https://github.com/violette-bleue/pimp-my-admin.git
```

Puis charge le dossier cloné comme extension non empaquetée (étapes 3 à 5 ci-dessus).

Pour mettre à jour :

```
git pull
```

Après un `pull`, l'extension devrait se mettre à jour seule après un refresh de page si elle tourne déjà. Si ce n'est pas le cas, retourne sur `chrome://extensions` et clique sur l'icône ⟳ (recharger) de l'extension pour que les changements soient pris en compte.

> ⚠️ même si je fais le maximum pour que ce soit robuste et sans bug, ça reste une première version : je te conseille de sauvegarder régulièrement un backup de tes templates au cas où (avec l'option "exporter" de l'extension ce sera plus facile qu'il n'y parait !)

Aucune configuration supplémentaire n'est nécessaire pour commencer. ♥


## Fonctionnalités

L'extension apparaît automatiquement sur les pages prises en charge. Actuellement :
- `0.1.0` affichage > templates 
- `0.1.1` général > catégories et forums
- `0.1.1` modules > gestion des pages html
- `0.1.1` modules > gestion des codes javascript


### 📁 **Dossier local** 
Le dossier local se structurera tout seul de la façon qui suit :
> ⚠️ **avec la version 0.1.1 il faudra mettre à jour l'arborescence de votre dossier** en ne laissant pas les dossiers templates à la racine directe. Ca ne changera pas à nouveau à l'avenir à priori, car cette nouvelle logique permettra l'ajout facile de nouvelles fonctionnalités sans tout casser ♥
  ```
  mon-dossier/
  ├── forums/ 
  ├── html/
  ├── js/
  └── templates/
  ```

L'arborescence des templates suit toujours la même logique : un sous-dossier par catégorie, un fichier `.html` par template :

![](docs/screenshots/tplname.png)

 ```
  templates/
  ├── general/
  ├── portail/
  ├── galerie/
  ├── calendrier/
  ├── groupes/
  ├── poster-mp/
  ├── moderation/
  ├── profil/
  └── version-mobile/
  ```


### 📤 Publication simplifiée

Tous les templates `en attente de publication` peuvent être mis à jour en un clic. 
`0.1.1` Cela a été étendu aux codes javascript et pages html.

### 🔍 Scan de la totalité des templates

L'onglet ![](docs/screenshots/toutescate.png) analyse l'ensemble des catégories (~150 templates) en une fois, sans quitter la page, et permet ensuite de mettre à jour et/ou publier les templates via un bouton unique.

### ⬇️ Export forumactif → dossier local

Permet l'import / export : des templates (`.html`), de la structure du forum (catégories/forums/sous-forums avec leurs permissions respectives `.csv`), des codes javascript (`.js`), des pages html (`.html`).

### 🚦 Mode live sync

Une fois le mode activé, il permettra de mettre à jour (et publier si l'option est sélectionnée) de façon **automatique** toute modification d'un fichier template `.html`. Pensé pour les dev qui veulent contrôler les choses régulièrement sur le forum et évacuer une partie des manipulations nécessaires pour modifier ses templates. 
`0.1.1` Le live sync a été étendu aux pages html et aux codes javascript.

### `0.1.1` Hub Forums (structure & permissions)

Dans `Général > Catégories et forums` une seule page pour l'édition des métadonnées et des 14 permissions de chaque forum, sélection multiple et gestion de masse, réorganisation en drag'n'drop comme dans le FA natif.

L'importation à partir d'un fichier de travail type tableur est possible en l'enregistrant au format `.csv`. Les colonnes reconnues sont `categorie`, `forum`, `sous forums`, `image` et `desc` — une ligne catégorie (ou forum) remplie devient la catégorie (ou le forum) courant pour toutes les lignes suivantes, jusqu'à la prochaine.

Les sous-forums peuvent s'écrire de deux façons, mélangeables dans le même fichier :

**En liste, sur la ligne de leur forum** — créés directement, sans description ni image :

| categorie | forum | sous forums | image | desc |
|---|---|---|---|---|
| catégorie 1 | | | | |
| | forum 1 | sf1, sf2, sf3 | https://…/forum1.jpg | blabla |
| | forum 2 | | | bloblo |

**Sur leur propre ligne** — ils gardent alors leur propre description/image, comme un forum normal :

| categorie | forum | sous forums | image | desc |
|---|---|---|---|---|
| catégorie 1 | | | | |
| | forum 1 | | https://…/forum1.jpg | blabla |
| | | sf1 | | lala |
| | | sf2 | | lili |



## Sécurité & confidentialité

- **Aucun identifiant stocké** : l'extension ne demande ni ne conserve aucun mot de passe ni token. Elle s'appuie sur ta session Forumactif déjà ouverte dans le navigateur. D'ailleurs elle a besoin que l'onglet reste ouvert dans le panneau d'administration pour fonctionner.
- **Aucun code distant exécuté** : tout contenu récupéré (pages FA, fichiers `.html` de template) est traité comme du *texte*, jamais évalué comme script, donc jamais accessible pour quiconque.
- **Permissions demandées** : accès au dossier local que *tu* choisis explicitement ; accès réseau à `*.forumactif.com/admin/*`, et dans le futur à `api.github.com` et `raw.githubusercontent.com` pour faire le lien avec une bibliothèque de thèmes/templates/codes js officiels pour l'extension.

## Crédits

Icônes de l'interface : [Icons8](https://icons8.com/icons).
