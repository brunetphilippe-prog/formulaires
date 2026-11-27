'use strict';
// NATIF = app Android installée (APK Capacitor) ; sinon navigateur / PWA.
const NATIF = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
// MTG – Check-list état véhicule (PWA hors ligne). Aucune donnée ni adresse dans ce code.
// Version 8 : envoi par Element (messagerie Matrix) par défaut ; le mail reste disponible en secours.
// Version 9 : vers Element, le fichier part en .json (même contenu). Element traite tout fichier
// « text/plain » (.txt) comme un simple message texte et refuse le partage
// (« Impossible de traiter les données de partage »). Par mail : toujours .txt.
const VERSION_FORMAT = 1;
const VERSION_APP = 9;

const SECTIONS = [
  { id: 'ext', titre: 'Extérieur', items: [
    'Carrosserie (rayures, chocs)', 'Pare-brise / vitres', 'Rétroviseurs',
    'Feux avant / arrière / clignotants', 'Pneus (usure, pression visuelle)', 'Plaques d’immatriculation'] },
  { id: 'int', titre: 'Intérieur', items: [
    'Propreté', 'Sièges et ceintures', 'Voyants du tableau de bord',
    'Klaxon', 'Essuie-glaces', 'Freins (ressenti au démarrage)'] },
  { id: 'sec', titre: 'Équipements de sécurité', items: [
    'Gilet haute visibilité', 'Triangle de signalisation', 'Extincteur', 'Trousse de secours'] },
  { id: 'niv', titre: 'Niveaux et papiers', items: [
    'Niveau d’huile', 'Liquide lave-glace', 'Carte grise / assurance à bord', 'Carte carburant'] },
];

// Parc véhicules MTG – à mettre à jour ici (puis changer VERSION dans sw.js).
// actif:false = hors service, affiché grisé mais sélectionnable.
const FLOTTE = [
  { num: 'V001', immat: 'EV297MW',  marque: 'Renault', modele: 'Megane 4',  cat: 'VL', km: 157742 },
  { num: 'V002', immat: 'GG309LJ',  marque: 'Renault', modele: 'Megane 4',  cat: 'VL', km: 91975 },
  { num: 'V003', immat: 'FC893KD',  marque: 'Peugeot', modele: '308',       cat: 'VL', km: 161495 },
  { num: 'V004', immat: 'FC916XY',  marque: 'Peugeot', modele: '308',       cat: 'VL', km: 171183 },
  { num: 'V005', immat: 'GJ674NL',  marque: 'Peugeot', modele: 'Rifter',    cat: 'VL', km: 36855 },
  { num: 'V006', immat: 'GK299EL',  marque: 'Peugeot', modele: 'Rifter',    cat: 'VL', km: 49647 },
  { num: 'V007', immat: 'CN596WG',  marque: 'Renault', modele: 'Megane 3',  cat: 'VL', km: 293858 },
  { num: 'V008', immat: '752BEH31', marque: 'Renault', modele: 'Scenic',    cat: 'VL', km: 368823, actif: false },
  { num: 'V009', immat: 'CZ698KX',  marque: 'Renault', modele: 'Trafic',    cat: 'VU', km: 88053 },
  { num: 'V010', immat: 'HJ202CY',  marque: 'Renault', modele: 'R5 E-tech', cat: 'VL', km: 604 },
];
const vehicule = immat => FLOTTE.find(v => v.immat === immat);

// ---------- stockage local ----------
const lire = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const ecrire = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { alert('Mémoire pleine : retirez des photos.'); } };
// mode : 'element' (par défaut) ou 'mail'. salon : nom ou adresse du salon Element de réception.
let cfg = Object.assign({ mode: 'element', salon: '', destinataire: '', agent: '', vehicules: '' }, lire('mtg_cfg', {}));
const viaElement = () => cfg.mode !== 'mail';
// Adresse de salon Matrix (#nom:serveur ou !id:serveur) : permet d'ouvrir le salon directement.
const adresseSalon = () => /^[#!][^\s:]+:[^\s]+$/.test(cfg.salon) ? cfg.salon : '';
const nomSalon = () => cfg.salon || 'le salon MTG de réception';
let f = lire('mtg_brouillon', null);
let etape = lire('mtg_etape', 0);

const uuid = () => (crypto.randomUUID ? crypto.randomUUID()
  : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }));
const aujourdhui = () => new Date().toLocaleDateString('fr-CA');
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function nouveau() {
  f = { id: uuid(), cree: new Date().toISOString(), immat: '', km: '', date: aujourdhui(), agent: cfg.agent,
        carburant: '', reponses: {}, commentaire: '' };
  etape = 0; sauver();
}
function sauver() { ecrire('mtg_brouillon', f); ecrire('mtg_etape', etape); }

// ---------- rendu ----------
const vue = document.getElementById('vue');
const pied = document.getElementById('pied');
const nbEtapes = SECTIONS.length + 2; // identification + sections + récapitulatif

function accueil() {
  document.getElementById('titre').textContent = 'MTG – Formulaires';
  document.getElementById('retour').classList.add('cache');
  pied.classList.add('cache'); setProg(0);
  const brouillon = f && (f.immat || Object.keys(f.reponses).length);
  vue.innerHTML = `
    ${viaElement() && !cfg.salon ? `<div class="carte info">Avant la première utilisation, ouvrez les <b>paramètres ⚙</b> pour saisir le <b>salon Element</b> de réception et votre nom. Mode d’emploi : bouton <b>?</b>.</div>` : ''}
    ${!viaElement() && !cfg.destinataire ? `<div class="carte info">Avant la première utilisation, ouvrez les <b>paramètres ⚙</b> pour saisir l’adresse mail de réception. Mode d’emploi : bouton <b>?</b>.</div>` : ''}
    <button class="tuile" id="go"><span>🚗</span>${brouillon ? 'Reprendre la check-list en cours' : 'Nouvelle check-list véhicule'}</button>
    ${brouillon ? `<button class="tuile" id="neuf"><span>➕</span>Recommencer à zéro</button>` : ''}
    <p class="sous" style="text-align:center">Fonctionne sans réseau. L’envoi se fait ${viaElement() ? 'par <b>Element</b>' : 'par mail'}.<br>Version ${VERSION_APP}${NATIF ? ' · app Android' : ''}</p>`;
  document.getElementById('go').onclick = () => { if (!f) nouveau(); afficher(); };
  const n = document.getElementById('neuf');
  if (n) n.onclick = () => { if (confirm('Effacer la check-list en cours ?')) { nouveau(); afficher(); } };
}

function setProg(i) { document.getElementById('prog').style.width = (100 * i / (nbEtapes - 1)) + '%'; }

function afficher() {
  document.getElementById('titre').textContent = 'État véhicule';
  document.getElementById('retour').classList.remove('cache');
  pied.classList.remove('cache'); setProg(etape);
  document.getElementById('prec').style.visibility = etape === 0 ? 'hidden' : 'visible';
  const suiv = document.getElementById('suiv');
  suiv.textContent = etape === nbEtapes - 1 ? (viaElement() ? 'Envoyer par Element' : 'Envoyer par mail') : 'Suivant';
  suiv.className = 'btn' + (etape === nbEtapes - 1 ? ' vert' : '');
  if (etape === 0) return ecranIdent();
  if (etape === nbEtapes - 1) return ecranRecap();
  ecranSection(SECTIONS[etape - 1]);
  window.scrollTo(0, 0);
}

function ecranIdent() {
  const v = vehicule(f.immat);
  vue.innerHTML = `<div class="carte"><h2>Le véhicule</h2><p class="sous">Étape 1 sur ${nbEtapes} · touchez votre véhicule</p>
    <div class="flotte">${FLOTTE.map(x => `<button class="veh ${x.immat === f.immat ? 'on' : ''} ${x.actif === false ? 'hs' : ''}" data-i="${x.immat}">
      <b>${x.immat}</b><span>${x.num} · ${x.marque} ${x.modele}${x.actif === false ? ' · hors service' : ''}</span></button>`).join('')}</div>
    <label>Kilométrage${v ? ` <span class="sous">(dernier connu : ${v.km.toLocaleString('fr-FR')} km)</span>` : ''}</label>
    <input id="km" type="number" inputmode="numeric" value="${esc(f.km)}">
    <label>Niveau de carburant / charge</label>
    <select id="carburant">${['', 'Plein', '3/4', '1/2', '1/4', 'Réserve'].map(o => `<option ${f.carburant === o ? 'selected' : ''}>${o}</option>`).join('')}</select>
    <label>Date</label><input id="date" type="date" value="${esc(f.date)}">
    <label>Votre nom</label><input id="agent" value="${esc(f.agent)}"></div>`;
  vue.querySelectorAll('.veh').forEach(b => b.onclick = () => { f.immat = b.dataset.i; sauver(); ecranIdent(); });
  ['km', 'carburant', 'date', 'agent'].forEach(k => document.getElementById(k).oninput = e => { f[k] = e.target.value; sauver(); });
  const km = document.getElementById('km');
  km.onchange = () => { if (v && f.km && +f.km < v.km) alert(`Attention : ${(+f.km).toLocaleString('fr-FR')} km est inférieur au dernier relevé (${v.km.toLocaleString('fr-FR')} km).`); };
}

function ecranSection(s) {
  vue.innerHTML = `<div class="carte"><h2>${s.titre}</h2><p class="sous">Étape ${etape + 1} sur ${nbEtapes}</p>
    <button class="btn sec" id="toutok" style="margin:0 0 6px">✓ Tout est OK</button>
    ${s.items.map((it, i) => {
      const k = s.id + i, r = f.reponses[k] || {};
      return `<div class="item" data-k="${k}"><div class="nom">${esc(it)}</div>
        <div class="choix"><button class="ok ${r.etat === 'OK' ? 'on' : ''}" data-v="OK">OK</button>
        <button class="def ${r.etat === 'DEFAUT' ? 'on' : ''}" data-v="DEFAUT">Défaut</button>
        <button class="na ${r.etat === 'NA' ? 'on' : ''}" data-v="NA">N/A</button></div>
        <div class="defaut ${r.etat === 'DEFAUT' ? 'on' : ''}">
          <textarea placeholder="Décrivez le défaut">${esc(r.note)}</textarea>
          <label class="btn sec" style="text-align:center;font-weight:700">📷 Ajouter une photo
            <input type="file" accept="image/*" capture="environment" class="cache"></label>
          <div class="photos">${(r.photos || []).map((p, j) => `<img src="${p}" data-j="${j}" alt="photo">`).join('')}</div>
        </div></div>`;
    }).join('')}</div>`;
  document.getElementById('toutok').onclick = () => {
    s.items.forEach((it, i) => { const k = s.id + i; if (!f.reponses[k]?.etat) f.reponses[k] = { libelle: it, section: s.titre, etat: 'OK' }; });
    sauver(); afficher(); };
  vue.querySelectorAll('.item').forEach(el => {
    const k = el.dataset.k, i = +k.slice(s.id.length);
    const rep = () => (f.reponses[k] ||= { libelle: s.items[i], section: s.titre });
    el.querySelectorAll('.choix button').forEach(b => b.onclick = () => { rep().etat = b.dataset.v; sauver(); afficher(); });
    el.querySelector('textarea').oninput = e => { rep().note = e.target.value; sauver(); };
    el.querySelector('input[type=file]').onchange = async e => {
      const file = e.target.files[0]; if (!file) return;
      (rep().photos ||= []).push(await compresser(file)); sauver(); afficher(); };
    el.querySelectorAll('.photos img').forEach(img => img.onclick = () => {
      if (confirm('Supprimer cette photo ?')) { rep().photos.splice(+img.dataset.j, 1); sauver(); afficher(); } });
  });
}

function compresser(file, max = 1280, q = 0.6) {
  return new Promise(res => {
    const img = new Image();
    img.onload = () => {
      const r = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = img.width * r; c.height = img.height * r;
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src); res(c.toDataURL('image/jpeg', q));
    };
    img.src = URL.createObjectURL(file);
  });
}

function manquants() {
  const m = [];
  if (!f.immat) m.push('Véhicule');
  if (!f.agent) m.push('Votre nom');
  SECTIONS.forEach(s => s.items.forEach((it, i) => { if (!f.reponses[s.id + i]?.etat) m.push(`${s.titre} : ${it}`); }));
  return m;
}
const defauts = () => Object.values(f.reponses).filter(r => r.etat === 'DEFAUT');

function ecranRecap() {
  const m = manquants(), d = defauts();
  vue.innerHTML = `<div class="carte"><h2>Récapitulatif</h2><p class="sous">${esc(f.immat)} · ${esc(f.km)} km · ${esc(f.date)}</p>
    ${m.length ? `<div class="info"><b>À compléter :</b><ul>${m.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
    <p><b>${d.length ? `<span class="r">${d.length} défaut(s)</span>` : '✅ Aucun défaut'}</b></p>
    <ul class="resume">${d.map(r => `<li class="r">${esc(r.libelle)}${r.note ? ' – ' + esc(r.note) : ''}</li>`).join('')}</ul>
    <label>Commentaire général</label><textarea id="com">${esc(f.commentaire)}</textarea></div>`;
  document.getElementById('com').oninput = e => { f.commentaire = e.target.value; sauver(); };
}

// ---------- envoi ----------
function texteMail() {
  const d = defauts();
  return `Check-list état véhicule\n\nVéhicule : ${f.immat}\nKilométrage : ${f.km}\nCarburant : ${f.carburant}\nDate : ${f.date}\nAgent : ${f.agent}\n\n`
    + (d.length ? `DÉFAUTS (${d.length}) :\n` + d.map(r => `- [${r.section}] ${r.libelle}${r.note ? ' : ' + r.note : ''}`).join('\n') : 'Aucun défaut constaté.')
    + (f.commentaire ? `\n\nCommentaire : ${f.commentaire}` : '')
    + `\n\n---\nFichier joint à importer dans MTG (Soumissions). Réf. ${f.id}`;
}

function preparer() {
  const payload = { format: 'mtg-soumission', version: VERSION_FORMAT, type: 'ETAT_VEHICULE', id: f.id,
    creeLe: f.cree, envoyeLe: new Date().toISOString(),
    donnees: { numero: vehicule(f.immat)?.num || null, immatriculation: f.immat, kilometrage: f.km ? +f.km : null, carburant: f.carburant,
      date: f.date, agent: f.agent, commentaire: f.commentaire,
      points: Object.entries(f.reponses).map(([cle, r]) => ({ cle, section: r.section, libelle: r.libelle,
        etat: r.etat, note: r.note || '', photos: r.photos || [] })) } };
  const base = `etat-vehicule_${f.immat.replace(/[^A-Z0-9]/g, '')}_${f.date}`;
  const nom = base + '.txt';         // mail et envoi en 2 gestes
  const nomJson = base + '.json';    // partage direct vers Element (type application/json)
  const objet = `[MTG] État véhicule ${f.immat} – ${f.date}${defauts().length ? ' – ' + defauts().length + ' défaut(s)' : ''}`;
  const json = JSON.stringify(payload);
  return { nom, nomJson, objet, json, corps: texteMail(), fichier: new File([json], nom, { type: 'text/plain' }),
    taille: Math.ceil(json.length / 1024) };
}

function envoyer() {
  const m = manquants();
  if (m.length) return alert('Il reste ' + m.length + ' point(s) à compléter.');
  if (!viaElement() && !cfg.destinataire) return alert('Saisissez l’adresse de réception dans les paramètres ⚙.');
  ecranEnvoi();
}

let partageOK = true;
function ecranEnvoi() {
  const p = preparer();
  const el = viaElement();
  // Element : partage direct seulement dans l'app Android (fichier .json). Dans un navigateur, le
  // partage web n'accepte que .txt, qu'Element refuse : on passe directement à l'envoi en 2 gestes.
  const partage = el ? NATIF : NATIF || partageOK && !!(navigator.canShare && navigator.canShare({ files: [p.fichier] }));
  const salon = adresseSalon();
  document.getElementById('titre').textContent = 'Envoi';
  pied.classList.add('cache'); setProg(nbEtapes - 1);

  // Envoi par Element : le fichier est partagé vers l'app Element, l'agent choisit le salon de réception.
  // On ne transmet QUE le fichier (pas de texte) : sinon certaines versions d'Element envoient le texte seul.
  const blocElement = partage ? `
      <p><b>1.</b> Appuyez ci-dessous, choisissez <b>Element</b>, puis le salon <b>${esc(nomSalon())}</b>, et envoyez.</p>
      <button class="btn vert" id="b_share">📤 Envoyer avec Element</button>
      <p class="sous" style="margin-top:8px">Element doit être installé et connecté sur ce téléphone. Fichier : ${esc(p.nomJson)} (${p.taille} Ko).</p>`
    : `
      <div class="info">Depuis un navigateur, le fichier se joint à la main dans Element. Pour un envoi en un geste, utilisez l’app Android MTG Véhicule.</div>
      <p><b>1.</b> Enregistrez le fichier sur le téléphone :</p>
      <button class="btn" id="b_dl">💾 Enregistrer le fichier</button>
      <p><b>2.</b> Ouvrez Element${salon ? '' : `, allez dans le salon <b>${esc(nomSalon())}</b>`}, puis joignez le fichier avec le trombone 📎 (dossier <i>Téléchargements</i>, fichier <i>${esc(p.nom)}</i>) :</p>
      ${salon ? `<button class="btn vert" id="b_salon">💬 Ouvrir le salon dans Element</button>` : ''}`;

  const blocMail = partage ? `
      <p class="sous">Destinataire : <b>${esc(cfg.destinataire)}</b></p>
      <p><b>1.</b> Appuyez ci-dessous puis choisissez votre messagerie (Gmail, Outlook…).</p>
      <button class="btn vert" id="b_share">📤 Partager par mail</button>
      <p class="sous" style="margin-top:8px">Le champ « À » n’est pas rempli automatiquement : saisissez <b>${esc(cfg.destinataire)}</b>.</p>`
    : `
      <p class="sous">Destinataire : <b>${esc(cfg.destinataire)}</b></p>
      <div class="info">Votre navigateur ne joint pas les fichiers automatiquement. Pour un envoi en un geste, ouvrez l’app dans <b>Google Chrome</b>.</div>
      <p><b>1.</b> Enregistrez le fichier sur le téléphone :</p>
      <button class="btn" id="b_dl">💾 Enregistrer le fichier</button>
      <p><b>2.</b> Ouvrez le mail (destinataire et texte déjà remplis), puis ajoutez la pièce jointe avec le trombone 📎 (dossier <i>Téléchargements</i>, fichier <i>${esc(p.nom)}</i>) :</p>
      <button class="btn vert" id="b_mail">✉️ Ouvrir le mail</button>`;

  vue.innerHTML = `<div class="carte"><h2>${el ? 'Envoyer par Element' : 'Envoyer la check-list'}</h2>
    ${el ? blocElement : blocMail}
    <p style="margin-top:22px"><b>${partage ? '2' : '3'}.</b> Une fois le ${el ? 'fichier <u>visible dans le salon</u>' : 'mail <u>réellement envoyé</u>'} :</p>
    <button class="btn sec" id="b_fini">✅ C’est envoyé, terminer</button>
    <button class="btn sec" id="b_retour">← Revenir à la check-list</button>
    <button class="btn sec" id="b_autre" style="font-size:15px;font-weight:600">${el ? 'Element indisponible ? Envoyer par mail' : 'Envoyer plutôt par Element'}</button></div>`;

  const q = id => document.getElementById(id);
  const telecharger = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(p.fichier); a.download = p.nom; document.body.appendChild(a); a.click(); a.remove(); };
  const ouvrirMail = () => { location.href = `mailto:${cfg.destinataire}?subject=${encodeURIComponent(p.objet)}&body=${encodeURIComponent(p.corps)}`; };
  // Dans l'app Android, une adresse externe est confiée à Android, qui ouvre Element s'il gère les liens matrix.to.
  const ouvrirSalon = () => { location.href = 'https://matrix.to/#/' + salon; };
  const secours = () => { partageOK = false; ecranEnvoi(); };
  if (partage) q('b_share').onclick = async () => {
    try {
      if (NATIF) {
        const { Filesystem, Share } = window.Capacitor.Plugins;
        const r = await Filesystem.writeFile({ path: el ? p.nomJson : p.nom, data: p.json, directory: 'CACHE', encoding: 'utf8' });
        if (el) await Share.share({ files: [r.uri], dialogTitle: 'Envoyer avec Element' });
        else await Share.share({ title: p.objet, text: p.corps, files: [r.uri], dialogTitle: 'Envoyer par mail' });
      } else await navigator.share({ files: [p.fichier] });
    }
    catch (e) {
      if (e.name === 'AbortError' || /cancel/i.test(String(e.message || e))) return;
      if (NATIF) return alert('Partage impossible : ' + (e.message || e));
      alert('Ce téléphone refuse le partage direct du fichier. On passe à l’envoi en 2 gestes.');
      secours();
    }
  };
  else {
    q('b_dl').onclick = telecharger;
    if (q('b_mail')) q('b_mail').onclick = ouvrirMail;
    if (q('b_salon')) q('b_salon').onclick = ouvrirSalon;
  }
  q('b_retour').onclick = () => afficher();
  q('b_autre').onclick = () => {
    if (el && !cfg.destinataire) {
      const a = prompt('Adresse mail de réception :', '');
      if (!a || !a.trim()) return;
      cfg.destinataire = a.trim();
    }
    cfg.mode = el ? 'mail' : 'element'; ecrire('mtg_cfg', cfg); ecranEnvoi();
  };
  q('b_fini').onclick = () => {
    if (!confirm(el ? 'Confirmer : le fichier apparaît dans le salon Element ? La check-list sera effacée du téléphone.'
                    : 'Confirmer : le mail est parti ? La check-list sera effacée du téléphone.')) return;
    const hist = lire('mtg_historique', []); hist.unshift({ id: f.id, immat: f.immat, date: f.date, via: el ? 'element' : 'mail' }); ecrire('mtg_historique', hist.slice(0, 30));
    f = null; localStorage.removeItem('mtg_brouillon'); etape = 0; ecrire('mtg_etape', 0); accueil();
  };
}

// ---------- aide ----------
function aide() {
  document.getElementById('titre').textContent = 'Aide';
  document.getElementById('retour').classList.remove('cache'); pied.classList.add('cache'); setProg(0);
  vue.innerHTML = `<div class="carte aide"><h2>Mode d’emploi</h2>
    <p class="sous">L’app fonctionne sans réseau. Seul l’envoi a besoin de la 4G ou du Wi-Fi.</p>
    <h3>Première utilisation</h3>
    <ol><li>Installez l’app <b>Element</b> sur le téléphone et connectez-vous avec votre compte (comme sur le PC).</li>
      <li>Vérifiez que vous êtes bien membre du <b>salon de réception MTG</b> (fourni par le service MTG).</li>
      <li>Dans cette app, touchez <b>⚙</b> en haut à droite : saisissez le <b>salon Element</b> et <b>votre nom</b>, puis <b>Enregistrer</b>. Ces réglages restent sur le téléphone.</li></ol>
    <h3>Faire une check-list</h3>
    <ol><li><b>Nouvelle check-list véhicule</b>, puis touchez la tuile de votre véhicule.</li>
      <li>Saisissez le <b>kilométrage</b> (le dernier connu est rappelé) et le niveau de carburant.</li>
      <li>Pour chaque point : <b>OK</b>, <b>Défaut</b> ou <b>N/A</b> (non applicable). « Tout est OK » remplit la page d’un coup.</li>
      <li>En cas de <b>défaut</b> : décrivez-le et ajoutez une <b>photo</b> 📷. Touchez une photo pour la supprimer.</li>
      <li>Au <b>récapitulatif</b>, vérifiez les défauts et ajoutez un commentaire si besoin.</li></ol>
    <p>La saisie est enregistrée en continu : vous pouvez fermer l’app et reprendre plus tard.</p>
    <h3>Envoyer par Element</h3>
    <ol><li>Touchez <b>Envoyer par Element</b>, puis <b>📤 Envoyer avec Element</b>.</li>
      <li>Dans la liste qui s’ouvre, choisissez <b>Element</b>, puis le <b>salon de réception MTG</b>, et validez l’envoi.</li>
      <li>Vérifiez dans Element que le fichier <b>etat-vehicule_…</b> (.json) apparaît bien dans le salon.</li>
      <li>Revenez dans l’app et touchez <b>✅ C’est envoyé, terminer</b>. Pas avant : la check-list serait effacée.</li></ol>
    <p>Si le partage est refusé, l’app propose l’envoi en 2 gestes : <b>Enregistrer le fichier</b>, puis l’ajouter dans le salon Element avec le trombone 📎 (dossier Téléchargements).</p>
    <h3>Element indisponible ?</h3>
    <p>Sur l’écran d’envoi, touchez <b>Element indisponible ? Envoyer par mail</b> : l’envoi se fait alors par mail, comme avant (adresse fournie par le service MTG). On peut aussi choisir le mode d’envoi dans les paramètres ⚙.</p>
    <h3>En cas de problème</h3>
    <ul><li><b>Pas de réseau</b> : finissez la check-list, envoyez plus tard. Rien n’est perdu.</li>
      <li><b>Element n’apparaît pas dans la liste</b> : installez Element, ou envoyez par mail.</li>
      <li><b>Element affiche « Impossible de traiter les données de partage »</b> : mettez l’app MTG Véhicule à jour (version 9 ou plus).</li>
      <li><b>Le salon n’apparaît pas dans Element</b> : demandez au service MTG de vous y inviter.</li>
      <li><b>Véhicule absent de la liste</b> : prévenez le service MTG.</li>
      <li><b>Fichier envoyé deux fois</b> : sans gravité, le doublon est écarté à l’import.</li>
      <li><b>Erreur de saisie après envoi</b> : refaites une check-list et signalez-le au service MTG.</li></ul>
    <p class="sous" style="margin-top:16px">Version ${VERSION_APP}${NATIF ? ' · app Android' : ''}</p></div>`;
}

// ---------- paramètres ----------
function parametres() {
  document.getElementById('titre').textContent = 'Paramètres';
  document.getElementById('retour').classList.remove('cache'); pied.classList.add('cache');
  vue.innerHTML = `<div class="carte"><h2>Paramètres</h2><p class="sous">Enregistrés uniquement sur ce téléphone.</p>
    <label>Mode d’envoi</label>
    <select id="p_mode"><option value="element" ${viaElement() ? 'selected' : ''}>Element (recommandé)</option>
      <option value="mail" ${viaElement() ? '' : 'selected'}>Mail</option></select>
    <label>Salon Element de réception</label>
    <input id="p_salon" value="${esc(cfg.salon)}" placeholder="ex. #mtg-vehicules:serveur" autocapitalize="off" autocorrect="off" spellcheck="false">
    <p class="sous" style="margin-top:4px">Nom du salon (affiché comme rappel) ou son adresse <b>#nom:serveur</b> (permet aussi de l’ouvrir d’un geste).</p>
    <label>Adresse mail de réception <span class="sous">(envoi par mail ou en secours)</span></label>
    <input id="p_dest" type="email" value="${esc(cfg.destinataire)}">
    <label>Votre nom (pré-rempli)</label><input id="p_agent" value="${esc(cfg.agent)}">
    <button class="btn" id="p_ok">Enregistrer</button></div>`;
  document.getElementById('p_ok').onclick = () => {
    const v = id => document.getElementById(id).value.trim();
    cfg = { mode: v('p_mode') === 'mail' ? 'mail' : 'element', salon: v('p_salon'), destinataire: v('p_dest'),
            agent: v('p_agent'), vehicules: '' };
    if (cfg.mode === 'mail' && !cfg.destinataire) return alert('Pour l’envoi par mail, saisissez l’adresse de réception.');
    ecrire('mtg_cfg', cfg); if (f && !f.agent) { f.agent = cfg.agent; sauver(); } accueil(); };
}

document.getElementById('reglages').onclick = parametres;
document.getElementById('aide').onclick = aide;
document.getElementById('retour').onclick = accueil;
document.getElementById('prec').onclick = () => { if (etape > 0) { etape--; sauver(); afficher(); } };
document.getElementById('suiv').onclick = () => { if (etape < nbEtapes - 1) { etape++; sauver(); afficher(); } else envoyer(); };

if (!NATIF && 'serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
accueil();
