'use strict';
// MTG – Check-list état véhicule (PWA hors ligne). Aucune donnée ni adresse dans ce code.
const VERSION_FORMAT = 1;

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

// ---------- stockage local ----------
const lire = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const ecrire = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { alert('Mémoire pleine : retirez des photos.'); } };
let cfg = lire('mtg_cfg', { destinataire: '', agent: '', vehicules: '' });
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
    ${!cfg.destinataire ? `<div class="carte info">Avant la première utilisation, ouvrez les <b>paramètres ⚙</b> pour saisir l’adresse mail de réception.</div>` : ''}
    <button class="tuile" id="go"><span>🚗</span>${brouillon ? 'Reprendre la check-list en cours' : 'Nouvelle check-list véhicule'}</button>
    ${brouillon ? `<button class="tuile" id="neuf"><span>➕</span>Recommencer à zéro</button>` : ''}
    <p class="sous" style="text-align:center">Fonctionne sans réseau. L’envoi se fait par mail.</p>`;
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
  suiv.textContent = etape === nbEtapes - 1 ? 'Envoyer par mail' : 'Suivant';
  suiv.className = 'btn' + (etape === nbEtapes - 1 ? ' vert' : '');
  if (etape === 0) return ecranIdent();
  if (etape === nbEtapes - 1) return ecranRecap();
  ecranSection(SECTIONS[etape - 1]);
  window.scrollTo(0, 0);
}

function ecranIdent() {
  const liste = cfg.vehicules.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  vue.innerHTML = `<div class="carte"><h2>Le véhicule</h2><p class="sous">Étape 1 sur ${nbEtapes}</p>
    <label>Immatriculation</label>
    <input id="immat" list="vl" autocomplete="off" placeholder="AB-123-CD" value="${esc(f.immat)}" style="text-transform:uppercase">
    <datalist id="vl">${liste.map(v => `<option value="${esc(v)}">`).join('')}</datalist>
    <label>Kilométrage</label><input id="km" type="number" inputmode="numeric" value="${esc(f.km)}">
    <label>Niveau de carburant</label>
    <select id="carburant">${['', 'Plein', '3/4', '1/2', '1/4', 'Réserve'].map(o => `<option ${f.carburant === o ? 'selected' : ''}>${o}</option>`).join('')}</select>
    <label>Date</label><input id="date" type="date" value="${esc(f.date)}">
    <label>Votre nom</label><input id="agent" value="${esc(f.agent)}"></div>`;
  ['immat', 'km', 'carburant', 'date', 'agent'].forEach(k => document.getElementById(k).oninput = e => {
    f[k] = k === 'immat' ? e.target.value.toUpperCase() : e.target.value; sauver(); });
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
  if (!f.immat) m.push('Immatriculation');
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

async function envoyer() {
  const m = manquants();
  if (m.length) return alert('Il reste ' + m.length + ' point(s) à compléter.');
  if (!cfg.destinataire) return alert('Saisissez l’adresse de réception dans les paramètres ⚙.');
  const payload = { format: 'mtg-soumission', version: VERSION_FORMAT, type: 'ETAT_VEHICULE', id: f.id,
    creeLe: f.cree, envoyeLe: new Date().toISOString(),
    donnees: { immatriculation: f.immat, kilometrage: f.km ? +f.km : null, carburant: f.carburant,
      date: f.date, agent: f.agent, commentaire: f.commentaire,
      points: Object.entries(f.reponses).map(([cle, r]) => ({ cle, section: r.section, libelle: r.libelle,
        etat: r.etat, note: r.note || '', photos: r.photos || [] })) } };
  const nom = `etat-vehicule_${f.immat.replace(/[^A-Z0-9]/g, '')}_${f.date}.json`;
  const fichier = new File([JSON.stringify(payload)], nom, { type: 'application/json' });
  const objet = `[MTG] État véhicule ${f.immat} – ${f.date}${defauts().length ? ' – ' + defauts().length + ' défaut(s)' : ''}`;
  const corps = texteMail();
  try {
    if (navigator.canShare && navigator.canShare({ files: [fichier] })) {
      await navigator.clipboard?.writeText(cfg.destinataire).catch(() => {});
      alert(`Choisissez votre messagerie.\nDestinataire : ${cfg.destinataire}\n(adresse copiée, à coller si elle n’apparaît pas)`);
      await navigator.share({ files: [fichier], title: objet, text: corps });
    } else {
      const a = document.createElement('a'); a.href = URL.createObjectURL(fichier); a.download = nom; a.click();
      alert('Le fichier a été téléchargé. Joignez-le au mail qui va s’ouvrir.');
      location.href = `mailto:${encodeURIComponent(cfg.destinataire)}?subject=${encodeURIComponent(objet)}&body=${encodeURIComponent(corps)}`;
    }
    const hist = lire('mtg_historique', []); hist.unshift({ id: f.id, immat: f.immat, date: f.date }); ecrire('mtg_historique', hist.slice(0, 30));
    if (confirm('Le mail est-il bien parti ? (OK = effacer la check-list)')) { f = null; localStorage.removeItem('mtg_brouillon'); etape = 0; ecrire('mtg_etape', 0); accueil(); }
  } catch (e) { if (e.name !== 'AbortError') alert('Envoi impossible : ' + e.message); }
}

// ---------- paramètres ----------
function parametres() {
  document.getElementById('titre').textContent = 'Paramètres';
  document.getElementById('retour').classList.remove('cache'); pied.classList.add('cache');
  vue.innerHTML = `<div class="carte"><h2>Paramètres</h2><p class="sous">Enregistrés uniquement sur ce téléphone.</p>
    <label>Adresse mail de réception</label><input id="p_dest" type="email" value="${esc(cfg.destinataire)}">
    <label>Votre nom (pré-rempli)</label><input id="p_agent" value="${esc(cfg.agent)}">
    <label>Immatriculations (une par ligne)</label><textarea id="p_veh" rows="6">${esc(cfg.vehicules)}</textarea>
    <button class="btn" id="p_ok">Enregistrer</button></div>`;
  document.getElementById('p_ok').onclick = () => {
    cfg = { destinataire: document.getElementById('p_dest').value.trim(), agent: document.getElementById('p_agent').value.trim(),
            vehicules: document.getElementById('p_veh').value };
    ecrire('mtg_cfg', cfg); if (f && !f.agent) { f.agent = cfg.agent; sauver(); } accueil(); };
}

document.getElementById('reglages').onclick = parametres;
document.getElementById('retour').onclick = accueil;
document.getElementById('prec').onclick = () => { if (etape > 0) { etape--; sauver(); afficher(); } };
document.getElementById('suiv').onclick = () => { if (etape < nbEtapes - 1) { etape++; sauver(); afficher(); } else envoyer(); };

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
accueil();
