/**
 * app_state.js - État global partagé + constantes
 * Doit être chargé EN PREMIER avant tous les autres modules JS
 */

const APP_VERSION = '2.0.63';
// Historique :
//   2.0.63 - MAJ : suppression totale du fallback « ouvrir APK / navigateur » ;
//            install uniquement via pont Qt (AppImage / Android)
//   2.0.62 - Audit clic MAJ PC + tablette (tests/run_update_click_audit.mjs) :
//            bouton ↻ MAJ, carte news, Mettre à jour, barre progression
//            (états updater simulés), Réessayer
//   2.0.61 - Audit clic-par-clic (desktop + tablette + téléphone) + passe
//            responsive Android/tablette ; aucun bug UI bloquant trouvé ;
//            script tests/run_click_audit.mjs livré
//   2.0.60 - Batterie : simu minute/année (nuit + ombrage créneau) ;
//            MAJ Android : confirmation PackageInstaller via Activity
//            (plus de BroadcastReceiver bloqué en arrière-plan) + fallback
//            ACTION_VIEW ; versionCode = XXYYZZ (2.0.60→20060) ; retry après
//            permission « apps inconnues » ;
//            conso jour/nuit manuelle (2 champs) sans Enedis 30 min ;
//            Android : plus de débordement devis/analyse (grilles minmax(0),
//            tables en scroll interne) — tests responsive renforcés
//   2.0.59 - Téléphone : vrai shell (barre compacte + menu ⋯, onglets courts,
//            hub projets d’abord, inputs 16px, chrome masqué sous le hub)
//   2.0.58 - Météo conservée (autosave + encoding compact) ; PC : pont Qt
//            webBridge réellement enregistré (miroir projets) ; Chart.js
//            ne crée plus de graphe sur canvas 0×0 (plantage Analyse horaire)
//   2.0.57 - Mobile : plus de scroll horizontal (barre projet) ; relays Nostr
//            réordonnés ; tests responsive alignés (Lieu = onglet)
//   2.0.56 - Partage : copie locale sur chaque appareil + LWW (save la plus
//            récente gagne) ; intro wizard « lieu confirmé » si météo OK
//   2.0.55 - Persistance projets : profil WebEngine disque (plus OffTheRecord),
//            miroir natif projects_backup.json (survit MAJ AppImage/APK + join)
//   2.0.54 - Re-audit UI : Annuler sur Rejoindre, onglets avancés scrollables
//            (bouton collant), hints « Lieu » (plus « colonne gauche »)
//   2.0.53 - Lieu dans un onglet dédié ; barre projet = nom + lieu seulement
//            (plus de colonne localisation permanente)
//   2.0.52 - Calculs blindés : coincidence 30 min toujours (plus de min mensuel
//            optimiste), météo horaire persistée, ombrage site mois/mois,
//            badges précision, import météo auto après Enedis
//   2.0.51 - Dimensionnement conservé si params inchangés ; UI PC : gap header,
//            hub plein écran (type/nouveau), câbles AC défaut, sync install,
//            Partager dans la barre projet
//   2.0.50 - AppImage : NSS vraiment exclus (appimagetool, plus de re-inject linuxdeploy)
//   2.0.49 - PC : Installer applique l’AppImage (plus d’ouverture GitHub)
//   2.0.48 - PC : croix / Alt+F4 quitte vraiment (fix Main.qml manquant en 2.0.47)
//   2.0.47 - PC : croix / Alt+F4 quitte vraiment (plus de flux retour Android)
//   2.0.46 - UI PC : hub plein écran 2 colonnes, plus de bandes latérales
//   2.0.45 - AppImage : ne plus embarquer NSS (crash FATAL sur distros récentes)
//   2.0.44 - Fix AppImage PC écran blanc : OSE_HAS_WEBENGINE sur applib +
//            QtWebEngineQuick::initialize() + QtWebEngineProcess embarqué
//   2.0.43 - Fix MAJ Android : Updater bien branché au WebView, permission d’install anticipée,
//            barre de progression animée, messages d’erreur plus justes
//   2.0.42 - Sync live inclinaison/azimut/surface/panneau entre onglets + devis ;
//            devis : lignes libres, import sans écraser l’adresse, onduleur réel ;
//            terrain → rafraîchit implantation ; câbles selon type d’install ;
//            implantation « Depuis Autonome » + dims PanelDB ; clarté pente/suiveur ;
//            versions alignées ; tests 403 GitHub ignorés
//   2.0.40 - Catalogue Rexel embarqué + filtre ; MAJ hub fiable ; UI responsive ;
//            hors-réseau : alerte si config insuffisante
//   2.0.39 - Carte : tuiles OSM + plein écran ; adresse chantier préremplie ;
//            import terrain dans la sidebar (comme la météo)
//   2.0.38 - Boussole mode photo : cap caméra correct téléphone debout (portrait/paysage)
//   2.0.37 - MAJ Android : bandeau + barre de progression fiable (plus de toast sans suite)
//   2.0.36 - Boussole : plus d’oscillation 90°↔300° (absolute vs relatif)
//   2.0.35 - Partage projet sans serveur (clé courte + QR, sync Nostr E2E)
//   2.0.34 - Catalogue Rexel (panneaux + onduleurs) + fiches PDF via visioneuse
//   2.0.33 - Hub : Matériel au-dessus du hub (z-index) ; nouveautés = 3 dernières versions
//   2.0.32 - Hub « Mettre à jour » lance téléchargement/install ; photo : pitch→élév ;
//            points du diagramme déplaçables (glisser)
//   2.0.31 - Tablette portrait/paysage : layout adapté ; boussole cap/pitch/offset
//            compensés selon l’angle d’écran (DeviceOrientation + screen.orientation)
//   2.0.30 - Mobile : caméra ombrage (CAMERA + WebView getUserMedia), safe-area,
//            barre projet / onglets / graphiques responsive (Pixel & co)
//   2.0.29 - Git complet téléphone + PC (isomorphic-git / IndexedDB) :
//            commits, branches, restauration — même UX partout
//   2.0.28 - Hub projets : carte Nouveautés / MAJ (notes GitHub + bouton Mettre à jour)
//   2.0.27 - Historique versions : snapshots locaux (Android/navigateur), plus
//            d’erreur gitLog ; git natif conservé sur AppImage desktop
//   2.0.26 - Site / ombrage : carte verrouillée hors édition lieu, diagramme
//            solaire manuel + photo/boussole, calibration, terrain 3D → tilt/az
//   2.0.25 - PDF devis + rapport : vrai fichier PDF (html2pdf embarqué),
//            contenu complet (annexe dimensionnement / bilan mensuel)
//   2.0.24 - Prime d’État saisie manuelle (barème auto / montant / sans prime)
//   2.0.23 - MAJ Android corrigée (permission apps inconnues, auto-install après
//            téléchargement, fallback URL API GitHub, statut PackageInstaller
//            dans le bandeau, téléchargement direct sans dialog bloquant)
//   2.0.22 - Chaîne installateur : Voc/Isc → câbles, hint « Chaînes » Système PV,
//            lien Implantation → estimation longueur DC
//   2.0.21 - Outils pro installateur : calculateur câbles DC/AC (section, chute
//            de tension, pertes), bibliothèques matériel (panneaux STC Voc/Isc/
//            Vmp/Imp + onduleurs éditables + hub 📚 Matériel), implantation
//            toiture 2.5D (canvas offline, sync dimensionnement)
//   2.0.20 - UX 2e passe : menu déroulant du type d'installation (remplace le
//            cycle de badge opaque), cohérence des champs batterie hybride/hors-
//            réseau (libellés + capacité utile en direct après DoD), CTA plus
//            clairs après dimensionnement (« Appliquer au système » → Devis),
//            aide sur les données Enedis 30 min pour la batterie hybride, fix
//            lecture fichier Enedis bloquée sans message en cas d'échec
//   2.0.19 - Devis : import batterie hybride (capacité + ligne de coût) depuis le
//            dimensionnement ; graphique flux d'énergie : série décharge batterie ;
//            2e projet démo « hybride » (réseau + batterie) dans le hub
//   2.0.18 - Type d'installation « hybride » (réseau + batterie) : 3e choix au hub,
//            batterie dans le parcours dimensionnement, simulation charge/décharge
//   2.0.17 - Fix build Android (JNI) + hub MAJ / export / import natifs
//   2.0.16 - Fix hub Android : MAJ ne ferme plus le hub ; export/import natifs
//   2.0.15 - Plus de calcul auto à l’ouverture ; surface obligatoire (plus de défaut 30 m²)
//   2.0.14 - MAJ : téléchargement APK en flux (anti OOM) + bandeau d’erreur clair
//   2.0.13 - Parcours dimensionnement étape par étape + objectif autoconso 90 %
//   2.0.12 - MAJ Android fiable (flux Colo Course : bannière + retours natifs)
//   2.0.11 - Fix sync réseau→dimensionnement (surface mode Fixe) + emoji/type install
//   2.0.10 - Hypothèses financières réglables (élec / actualisation / dégradation / horizon)
//   2.0.9 - MAJ Android fiable (pont + téléchargement flux + install auto)
//   2.0.8 - Barre projet mobile compacte (plus de mur de boutons)
//   2.0.7 - MAJ Android in-app + layout mobile (largeur)
//   2.0.6 - Hub projets unique (plus de modal séparée)
//   2.0.5 - Scripts sans ?v= + hardening hub
//   2.0.4 - Fix WebHost ?v= (hub + boutons morts sur Android)
//   2.0.3 - Hub plein écran, emojis Noto, logo adaptive, Qt only (plus Electron)
//   2.0.2 - Hub projets + recherche + bouton MAJ, capacité batterie saisie
//   2.0.1 - Logo Android/PC, projet démo complet (Enedis 30 min synthétique cohérent)
//   2.0.0 - Port Qt natif, APK + AppImage, mises à jour GitHub Releases
//   1.4.0 - Module devis professionnel
//   1.5.0 - Refactoring multi-fichiers, modal démarrage, infos client,
//            module horaire EDF, dimensionnement onduleurs
//   1.5.1 - Serveur de développement local (.claude/launch.json)
//   1.5.2 - Refacto constants.js · bugfixes (autoConso/ROI/panelWp)
//            · onglet réseau : calcul auto nb panneaux depuis surface
//   1.5.3 - Suppression valeurs par défaut · projet démo au démarrage
//   1.6.0 - Hors-réseau : import Enedis direct, simulation slot-par-slot 17520
//   1.6.1 - Script serve.sh Linux
//   1.7.0 - Rb intégration numérique (tout azimut), HDKR anisotrope, payback/VAN/LCOE
//   1.7.1 - Audit bugs B1-B10 : payback DCF, reset Enedis, selectOptimal sans mutation,
//            années bissextiles, AppState initialisé, LCOE nominal
//   1.7.2 - Fix sandbox Linux : AppImage utilisable sans --no-sandbox
//   1.7.3 - Fix sandbox Linux : wrapper --no-sandbox + release non-draft
//   1.7.4 - Bouton Enedis unifié (même modal réseau/batterie) + status sync
//   1.7.5 - Édition projet (nom + client) + persistance complète à la réouverture
//   1.7.6 - Fix Auto surface, restauration Enedis au chargement, auto-save 3min
//   1.8.0 - Données horaires : auto-affichage, 12 mois, graphe superposition annuelle
//   1.8.1 - Saisie modele panneau + bibliotheque globale (ose_panels_v1)
//   1.8.2 - Git autosave : chaque action importante crée un commit git
//   1.8.3 - Fix preload.js absent de l'AppImage + gitAutoSave sans projet actif
//   1.8.4 - Fix snap Toulouse + projets fantômes au démarrage
//   1.8.5 - Gestionnaire bibliothèque panneaux : dimensions, lien, datasheet, PDF

const AppState = {
  location:   { lat: 48.8566, lon: 2.3522, alt: 35, name: 'Paris, France' },
  weatherData: null,
  demoData:   null,
  map:        null,
  marker:     null,
  activeTab:  'sizing',

  // Résultats de calcul
  lastGridResult:         null,
  lastGridParams:         null,
  lastOffgridResult:      null,
  lastSizingResult:       null,
  lastSizingInput:        null,
  lastSizingContext:      null,   // empreinte lieu/météo/Enedis au moment du calcul
  lastOffgridSizingResult: null,
  lastOffgridSizingInput: null,
  lastOffgridSizingContext: null,
  // Recommandations d'origine (calculées une fois par OffgridSizing.run, non écrasées par
  // la sélection d'une case de la heatmap) — servent à garder "recommandé" et "sélectionné"
  // visibles séparément, et à afficher la config "Économique" à côté de "Autonome".
  lastOffgridSizingRecommended: null,
  lastOffgridSizingEconomic:    null,
  // true pendant loadProject / restoreFormState — ne pas invalider le dimensionnement
  _restoringProject: false,

  // Gestion de projets
  currentProjectId: null,   // null = projet non sauvegardé
  currentClient: {           // infos client du projet en cours
    nom:     '',
    adresse: '',
    tel:     '',
    email:   ''
  },

  // Données horaires (depuis import Enedis 30min)
  hourlyEnedisData: null,   // { halfHourly: Float32Array, year: 2023, format: '30min' }
  hourlyWeatherData: null,  // données météo horaires (PVGIS)
  enedisYear: null,         // année des données Enedis importées

  // Résultats de dimensionnement (candidats)
  lastSizingCandidates: null,
  lastOffgridSizingCandidates: null,

  // Données HP/HC mensuelles (Enedis)
  monthlyKwhHp: null,       // tableau 12 valeurs kWh HP par mois

  // Paramètre prime autoconso (modifiable via AppAPI)
  _includeIncentive: true,

  // Type d'installation : 'grid' (raccordé réseau) | 'hybrid' (réseau + batterie) | 'offgrid' (autonome)
  installationType: 'grid',

  // Paramètres d'installation partagés entre onglets
  install: {
    tilt:       30,
    azimuth:    0,
    surface:    null,
    panelWp:    400,
    panelM2:    1.96,
    losses:     14,
    tech:       'crystSi',
    panelModel: '',
    inverterModel: '', // dernière valeur d'onduleur (inp-inverter-model) répercutée sur dv-sys-inverter
  },

  // Profil d'horizon / ombrage / terrain (onglet Site)
  siteSurvey: null,

  // Édition carte (location.js) — false = lieu verrouillé
  mapEditEnabled: false,
};

// Champs de formulaire persistés dans un projet
const PROJECT_FIELDS = [
  // Système PV réseau (Ppeak calculé depuis surface + panneaux)
  'inp-surface','inp-panel-model','inp-panel-wp','inp-panel-m2','sel-tech','inp-losses','inp-tilt','inp-azimuth','inp-cost','inp-kwh-price','inp-co2',
  'inp-panel-voc','inp-panel-isc','inp-panel-vmp','inp-panel-imp','inp-panel-bifacial','inp-inverter-model',
  // Dimensionnement EDF
  'sz-tariff','sz-price-base','sz-price-hp','sz-price-hc','sz-subscription',
  ...Array.from({length:12}, (_,i) => `sz-kwh-${i+1}`),
  'sz-load-day','sz-load-night',
  'sz-tilt','sz-azimuth','sz-surface','sz-panel-model','sz-panel-wp','sz-panel-m2','sz-losses','sz-tech',
  'sz-panel-voc','sz-panel-isc','sz-panel-vmp','sz-panel-imp','sz-panel-bifacial',
  'sz-strategy','sz-target-coverage','sz-cost-kwp','sz-cost-total','sz-feedin',
  'sz-elec-escalation','sz-discount-rate','sz-panel-degradation','sz-finance-years',
  'sz-incentive-mode','sz-incentive',
  // Batterie hybride (réseau + stockage)
  'sz-batt-tech','sz-batt-kwh',
  // Système réseau — mode panneaux
  'grid-panel-mode','grid-npanels-fixe',
  // Hors réseau
  'og2-daily-default',
  ...Array.from({length:12}, (_,i) => `og2-day-${i+1}`),
  'og2-batt-tech','og2-batt-kwh','og2-tilt','og2-azimuth','og2-surface',
  'og2-panel-model','og2-panel-wp','og2-panel-m2','og2-losses','og2-target-coverage',
  'og2-panel-voc','og2-panel-isc','og2-panel-vmp','og2-panel-imp','og2-panel-bifacial',
  'og2-pv-cost-kwp','og2-bos-cost',
  // Hors réseau — mode panneaux
  'og2-panel-mode','og2-npanels-fixe',
  // Implantation (visualiseur 2.5D)
  'lay-roof-w','lay-roof-d','lay-panel-w','lay-panel-h','lay-npanels','lay-rows','lay-tilt','lay-azimuth',
  // Câbles DC/AC (section, chute de tension)
  'cbl-dc-npanels','cbl-dc-rows','cbl-dc-pitch','cbl-dc-dist-inv',
  'cbl-dc-isc','cbl-dc-voc','cbl-dc-strings-parallel','cbl-dc-panels-series',
  'cbl-dc-i','cbl-dc-l','cbl-dc-u','cbl-dc-maxdrop','cbl-dc-material',
  'cbl-ac-mode','cbl-ac-cosphi','cbl-ac-p','cbl-ac-dist',
  'cbl-ac-i','cbl-ac-l','cbl-ac-u','cbl-ac-maxdrop','cbl-ac-material',
  // Devis professionnel
  'dv-ins-company','dv-ins-siret','dv-ins-rge','dv-ins-address','dv-ins-phone','dv-ins-email',
  'dv-cli-name','dv-cli-company','dv-cli-address','dv-cli-phone','dv-cli-email',
  'dv-site-address','dv-site-type','dv-site-surface','dv-site-tilt','dv-site-azimuth',
  'dv-sys-ppeak','dv-sys-panels','dv-sys-panel-model','dv-sys-inverter','dv-sys-batt',
  'dv-sys-prod','dv-sys-co2','dv-sys-autonomy',
  // Lignes devis dynamiques (JSON) — les anciens champs dv-line-*-* sont migrés à la restauration
  'dv-quote-lines-json',
  'dv-tva','dv-remise','dv-validity','dv-notes','dv-date','dv-ref'
];
