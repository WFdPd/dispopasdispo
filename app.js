/* ============================================================
   dispoPASdispo — application installable (PWA)
   Firebase : Authentication (téléphone + mot de passe) + Firestore
   Collections : interim, demandes, activation, staff, roles
   ============================================================ */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, deleteUser } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore, collection, doc, getDoc, setDoc, updateDoc, deleteDoc, onSnapshot, query, where, writeBatch, Timestamp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const fbApp = initializeApp(firebaseConfig);
const auth = getAuth(fbApp);
const db = getFirestore(fbApp);

const QUALIFS = ["Maçon","Coffreur-boiseur","Ferrailleur","Électricien","Plombier","Peintre","Plaquiste","Couvreur","Carreleur","Conducteur d'engins","Grutier","Manœuvre","Chef d'équipe","Autre"];

const qs = u => Array.isArray(u.qualifs) ? u.qualifs : (u.qualif ? [u.qualif] : []);
const qtxt = u => qs(u).join(' / ') || '—';
const allQualifs = () => { const set = new Set(QUALIFS); try{ Store.all('interim').forEach(u=>qs(u).forEach(q=>set.add(q))); }catch(e){} return [...set]; };
const qSelects = (idp, keyp, f) => [1,2,3].map(i => { const cur = f[keyp+i] || ''; const opts = allQualifs().map(x=>`<option ${cur===x?'selected':''}>${esc(x)}</option>`).join('');
  return `<label>${i===1?'Qualification principale':'Qualification n°'+i+' (facultatif)'}</label><select id="${idp}${i}"><option value="">${i===1?'— Choisir —':'— Aucune —'}</option>${opts}</select>`; }).join('');
const readQ = idp => [...new Set([1,2,3].map(i=>{ const e=document.getElementById(idp+i); return e?e.value.trim():''; }).filter(Boolean))].slice(0,3);
const splitQ = v => [...new Set(String(v||'').split(/[,;/+|]|\s+et\s+/i).map(x=>x.trim()).filter(Boolean))].slice(0,3);
const LOGO = `<svg viewBox="0 0 100 60" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
<g><circle cx="26" cy="9" r="7" fill="#7cc243"/><path d="M26 18 L38 32 L33 33 L35 45 L32 45 L32 58 L26 58 L26 18Z" fill="#b9e38d"/><path d="M26 18 L14 32 L19 33 L17 45 L20 45 L20 58 L26 58 Z" fill="#7cc243"/></g>
<g><circle cx="72" cy="10" r="7" fill="#f2668f"/><path d="M72 19 L84 33 L80 34 L80 58 L72 58 Z" fill="#ffa3bd"/><path d="M72 19 L60 33 L64 34 L64 58 L72 58 Z" fill="#f2668f"/></g></svg>`;

const $app = document.getElementById('app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const GRACE_JOURS = 7; // après expiration : « À vérifier » pendant 7 jours, puis considéré non disponible
const VALIDITE_JOURS = 7; // validité par défaut d'un statut « Disponible » sans date de fin
const isoOf = ts => { const d=new Date(ts||Date.now()); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); };
const addDays = (iso,n) => { const x=new Date(iso+'T12:00:00'); x.setDate(x.getDate()+n); return isoOf(x.getTime()); };
const digits = s => String(s||'').replace(/\D/g,'');
const fmtDate = d => { if(!d) return '—'; const [y,m,j]=d.split('-'); return `${j}/${m}/${y}`; };
const today = () => { const d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); };
/* ---------- Identifiants ---------- */
const mail = (tel, v) => `${tel}-${v}@dispopasdispo.invalid`; // adresse interne : l'intérimaire ne voit jamais d'e-mail
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   // sans 0/O/1/I/L
const CODE_JOURS = 7;
function genCode(){ const a = new Uint32Array(8); crypto.getRandomValues(a); return [...a].map(n => CODE_ALPHABET[n % CODE_ALPHABET.length]).join(''); }
const fmtCode = c => String(c||'').replace(/(.{4})(.{4})/, '$1-$2');
const newActivation = kind => ({ code: genCode(), expires: Timestamp.fromMillis(Date.now() + CODE_JOURS*864e5), kind });
const msTs = t => (t && typeof t.toMillis === 'function') ? t.toMillis() : (typeof t === 'number' ? t : 0);

/* ---------- Couche de stockage (Firestore) ---------- */
const Store = (() => {
  const data = { interim:{}, demandes:{}, activation:{}, staff:{} };
  const subs = []; let unsubs = [];
  const notify = () => subs.forEach(f => f());
  const listen = (name, ref) => unsubs.push(onSnapshot(ref, snap => {
    const o = {}; snap.docs.forEach(d => { o[d.id] = { id:d.id, ...d.data() }; });
    data[name] = o; notify();
  }, err => console.warn('firestore', name, err && err.code)));
  return {
    onChange(f){ subs.push(f); },
    all: name => Object.values(data[name]),
    one: (name, id) => data[name][id] || null,
    start(role, tel){
      this.stop();
      if(role === 'agence'){
        ['interim','demandes','activation','staff'].forEach(n => listen(n, collection(db, n)));
      } else {
        unsubs.push(onSnapshot(doc(db, 'interim', tel), d => { data.interim = d.exists() ? { [d.id]: { id:d.id, ...d.data() } } : {}; notify(); }, err => console.warn('interim', err && err.code)));
        listen('demandes', query(collection(db, 'demandes'), where('tel', '==', tel)));
      }
    },
    stop(){ unsubs.forEach(u => { try{ u(); }catch(e){} }); unsubs = []; Object.keys(data).forEach(k => data[k] = {}); },
    set: (name, id, obj) => setDoc(doc(db, name, id), obj),
    patch: (name, id, obj) => updateDoc(doc(db, name, id), obj),
    del: (name, id) => deleteDoc(doc(db, name, id))
  };
})();

/* ---------- État de l'interface ---------- */
let S = { role:null, tel:null, uid:null, view:'accueil', authTab:'connexion', msg:null, modal:null, form:{}, search:{qualif:'', from:today(), done:false}, loading:true };
let registering = false;
const me = () => Store.one('interim', S.tel);

/* ---------- Rendu ---------- */
let pendingRender = false;
function render(){
  const a = document.activeElement;
  if(a && ['INPUT','SELECT','TEXTAREA'].includes(a.tagName) && $app.contains(a) && !S._forcing){ pendingRender = true; return; }
  pendingRender = false;
  let html = '';
  if(S.loading) html = `<main class="accueil"><div>${LOGO}</div><p class="aide">Chargement…</p></main>`;
  else if(!S.role) html = S.view==='auth' ? vAuth() : vAccueil();
  else if(S.role==='interim') html = vInterim();
  else html = vAgence();
  $app.innerHTML = html + (S.modal ? vModal() : '');
}
document.addEventListener('focusout', () => { setTimeout(()=>{ if(pendingRender){ const a=document.activeElement; if(!(a && ['INPUT','SELECT','TEXTAREA'].includes(a.tagName))) render(); } }, 50); });
Store.onChange(render);
function go(patch){ Object.assign(S, patch); S._forcing=true; render(); S._forcing=false; }

const pied = () => `<div class="pied">dispoPASdispo</div>`;

function header(titre, sous, cloche){
  return `<header class="top"><div class="logo">${LOGO}</div><div class="titre">${esc(titre)}<small>${esc(sous||'')}</small></div>
  ${cloche!=null ? `<button class="bell" data-act="goto-msg" aria-label="Notifications">🔔${cloche>0?`<span class="dot">${cloche}</span>`:''}</button>`:''}
  <button class="quit" data-act="aide" style="margin-right:4px">Aide</button><button class="quit" data-act="logout">Quitter</button></header>`;
}

function vAccueil(){
  return `<main class="accueil"><div>${LOGO}</div><h1>dispoPASdispo</h1>
  <p class="aide">Indiquez votre disponibilité en 2 clics.<br>L'agence sait qui peut être mobilisé, et quand.</p>
  <button class="btn vert" data-act="acces">Accéder à mon espace</button>
  <button class="btn" data-act="aide" style="margin-top:22px">❓ Besoin d'aide ?</button>${pied()}</main>`;
}

/* ----- Connexion unique (intérimaires et agence) ----- */
function vAuth(){
  const f = S.form, tab = S.authTab;
  const msg = S.msg ? `<div class="msg ${S.msg.t}">${esc(S.msg.m)}</div>` : '';
  return header('Connexion','') + `<main>
  <div class="onglets"><button class="${tab==='connexion'?'actif':''}" data-act="tab" data-tab="connexion">Connexion</button><button class="${tab==='creation'?'actif':''}" data-act="tab" data-tab="creation">Créer mon compte</button></div>
  ${msg}
  ${tab==='connexion' ? `
    <label>N° de téléphone</label><input id="f-tel" inputmode="tel" autocomplete="username" value="${esc(f.tel||'')}" placeholder="06 12 34 56 78">
    <label>Mot de passe</label><input id="f-pw" type="password" autocomplete="current-password">
    <button class="btn vert" data-act="login">Connexion</button>`
  : `
    <p class="aide">Pour créer votre compte, l'agence doit d'abord vous avoir enregistré, puis vous remettre un <b>code d'activation</b> (8 caractères, valable 7 jours).</p>
    <label>N° de téléphone (celui donné à l'agence)</label><input id="f-tel" inputmode="tel" autocomplete="username" value="${esc(f.tel||'')}" placeholder="06 12 34 56 78">
    <label>Code d'activation</label><input id="f-code" autocapitalize="characters" autocomplete="one-time-code" maxlength="9" placeholder="K7M4-9PXQ">
    <label>Créer un mot de passe (8 caractères min.)</label><input id="f-pw" type="password" autocomplete="new-password">
    <label>Confirmer le mot de passe</label><input id="f-pw2" type="password" autocomplete="new-password">
    <button class="btn vert" data-act="register">Créer mon compte</button>`}
  <button class="btn gris" data-act="retour-accueil">← Retour</button>${pied()}</main>`;
}

/* ----- Équipe agence + intérimaires (onglet « Intérimaires ») ----- */
function blocCode(u){
  const a = Store.one('activation', u.tel);
  if(!a) return '';
  const exp = msTs(a.expires), perime = exp && exp < Date.now();
  return `<div class="msg info" style="margin:8px 0 0">🔑 Code d'activation à communiquer : <b style="font-size:18px;letter-spacing:2px">${esc(fmtCode(a.code))}</b><br><span style="font-size:12px">${perime ? '<b>Expiré</b> — générez un nouveau code.' : 'Valable jusqu\'au '+new Date(exp).toLocaleDateString('fr-FR')}</span></div>`;
}
function vAgenceEquipe(){
  const list = Store.all('interim').sort((a,b)=>(a.nom||'').localeCompare(b.nom||''));
  const staff = Store.all('staff').sort((a,b)=>(a.nom||'').localeCompare(b.nom||''));
  const f = S.form;
  const pref = {attente:['orange','Contrôle Préfecture en cours (48 h)'], ok:['vert','Préfecture OK'], nok:['rouge','Préfecture NON OK']};
  const items = list.map(u=>`<div class="item"><div class="ligne"><div><div class="nom">${esc(u.prenom)} ${esc(u.nom)}</div><div class="sous">${esc(qtxt(u))} · ${esc(u.tel)}${u.ci?` · CI •••${esc(String(u.ci).slice(-3))}`:''}</div></div>
    <span class="badge ${pref[u.pref][0]}">${pref[u.pref][1]}</span></div>
    <div class="sous">Application : ${u.registered?'✅ compte créé':'⏳ pas encore activée'}${(()=>{const e=etat(u);return e==='dispo'?` · <b style="color:var(--vert-fonce)">Disponible</b> (valable jusqu'au ${fmtDate(validUntil(u))})`:e==='futur'?` · Disponible dès le ${fmtDate(u.from)}`:e==='indispo'?` · Indisponible jusqu'au ${fmtDate(u.from)}`:e==='verifier'?' · <b style="color:#8a5a00">À vérifier</b>':e==='expire'?' · Non disponible (non reconfirmé)':'';})()}</div>
    ${u.pref==='ok' && !u.registered ? blocCode(u) : ''}
    <div class="actions">${u.pref==='ok' && !u.registered ? `<button class="btn petit bleu" data-act="gen-code" data-tel="${esc(u.tel)}" data-kind="interim">${Store.one('activation',u.tel)?'Nouveau code':'Générer le code'}</button>`:''}${u.pref==='attente'?`<button class="btn vert petit" data-act="pref" data-tel="${esc(u.tel)}" data-v="ok">Préfecture OK</button><button class="btn petit" style="color:var(--rouge);border-color:var(--rouge)" data-act="pref" data-tel="${esc(u.tel)}" data-v="nok">Préfecture NON OK</button>`:''}
    ${u.registered?`<button class="btn petit gris" data-act="reset-acces" data-tel="${esc(u.tel)}" data-kind="interim">Réinitialiser l'accès</button>`:''}<button class="btn petit gris" data-act="suppr-interim" data-tel="${esc(u.tel)}">Supprimer</button></div></div>`).join('');
  const staffItems = staff.map(s=>`<div class="item"><div class="ligne"><div><div class="nom">${esc(s.prenom)} ${esc(s.nom)}</div><div class="sous">${esc(s.tel)}</div></div><span class="badge ${s.registered?'vert':'orange'}">${s.registered?'Compte créé':'À activer'}</span></div>
    ${!s.registered ? blocCode(s) : ''}
    ${s.uid===S.uid ? '<div class="sous">C\'est vous.</div>' : `<div class="actions">${!s.registered?`<button class="btn petit bleu" data-act="gen-code" data-tel="${esc(s.tel)}" data-kind="staff">${Store.one('activation',s.tel)?'Nouveau code':'Générer le code'}</button>`:`<button class="btn petit gris" data-act="reset-acces" data-tel="${esc(s.tel)}" data-kind="staff">Réinitialiser l'accès</button>`}<button class="btn petit gris" data-act="suppr-staff" data-tel="${esc(s.tel)}">Retirer</button></div>`}</div>`).join('');
  return `<h1>Intérimaires</h1>
  <p class="aide">Enregistrement d'un nouvel intérimaire à l'agence (pièce d'identité, téléphone…), envoi et contrôle Préfecture (48 h). Une fois « Préfecture OK », un code d'activation s'affiche : remettez-le à l'intérimaire pour qu'il crée son compte.</p>
  ${S.msg?`<div class="msg ${S.msg.t}">${esc(S.msg.m)}</div>`:''}
  <h2>Importer une liste (Excel / CSV)</h2>
  ${vImport()}
  <h2>Nouvel intérimaire</h2>
  <div class="ligne-form"><div><label>Nom</label><input id="n-nom" value="${esc(f.nn||'')}"></div><div><label>Prénom</label><input id="n-prenom" value="${esc(f.np||'')}"></div></div>
  <label>N° de téléphone</label><input id="n-tel" inputmode="tel" value="${esc(f.nt||'')}">
  ${qSelects('n-q','nq',f)}
  <label>N° de pièce d'identité (CI) — facultatif, 3 derniers caractères conservés</label><input id="n-ci" value="${esc(f.nc||'')}">
  <button class="btn bleu" data-act="add-interim">Enregistrer et envoyer au contrôle Préfecture</button>
  <h2>Liste (${list.length})</h2><div class="liste">${items||'<div class="vide">Aucun intérimaire enregistré.</div>'}</div>
  <h2>Équipe agence (${staff.length})</h2>
  <p class="aide">Les commerciaux qui peuvent accéder à l'espace agence. Chacun active son compte avec un code, comme un intérimaire.</p>
  <div class="liste">${staffItems||'<div class="vide">Aucun membre.</div>'}</div>
  <div class="ligne-form"><div><label>Nom</label><input id="s-nom" value="${esc(f.sn||'')}"></div><div><label>Prénom</label><input id="s-prenom" value="${esc(f.sp||'')}"></div></div>
  <label>N° de téléphone</label><input id="s-tel" inputmode="tel" value="${esc(f.st||'')}">
  <button class="btn bleu" data-act="add-staff">Ajouter un membre de l'équipe</button>`;
}

function vAide(){
  const estAgence = S.role==='agence';
  const tab = estAgence ? (S.aideTab || 'agence') : 'interim';
  const d = (q,r) => `<details style="border:1.5px solid var(--bord);border-radius:12px;padding:11px 13px;margin:8px 0"><summary style="font-weight:600;cursor:pointer">${q}</summary><div style="margin-top:8px;font-size:14px;line-height:1.5;color:var(--texte)">${r}</div></details>`;
  const interim = `
    <p class="aide">Vous êtes intérimaire : voici comment utiliser dispoPASdispo.</p>
    ${d("Je n'ai pas encore de compte : comment faire ?","<ol style='padding-left:18px;margin:0'><li>Présentez-vous à l'agence (pièce d'identité, téléphone).</li><li>L'agence vous enregistre et envoie votre dossier au contrôle Préfecture (réponse sous 48 h).</li><li>Une fois « Préfecture OK », l'agence vous remet un <b>code d'activation de 8 caractères</b> (valable 7 jours).</li><li>Ouvrez l'application, onglet <b>Créer mon compte</b> : <b>le même numéro de téléphone que celui donné à l'agence</b>, le code, et un mot de passe.</li></ol>")}
    ${d("« Création impossible… »","Le numéro n'est pas encore enregistré par l'agence, le code est incorrect ou expiré, ou le compte est déjà activé. Vérifiez le numéro et le code (sans espace), puis demandez un nouveau code à l'agence si besoin.")}
    ${d("Comment indiquer ma disponibilité ?","Sur l'écran d'accueil, touchez <b>✅ Disponible</b> et indiquez la date de début (et, si vous le souhaitez, jusqu'à quand c'est valable), ou touchez <b>⛔ Non disponible</b> et indiquez la date à laquelle vous serez de nouveau disponible. Puis <b>Enregistrer</b>.")}
    ${d("Pourquoi l'agence me voit « À vérifier » ou « Non disponible » ?","Votre déclaration a une durée de validité : sans date de fin, elle reste valable 7 jours. Passé ce délai, vous apparaissez « À vérifier » pendant 7 jours, puis « Non disponible ». Mettez simplement votre disponibilité à jour pour revenir dans les recherches.")}
    ${d("À quoi sert la messagerie ? La cloche ?","La cloche (et le chiffre rouge) indiquent qu'un nouveau message vous attend. La messagerie sert <b>uniquement</b> à confirmer votre disponibilité pour un chantier : l'agence indique la ville, la durée et la date de début, et vous répondez « Je confirme » ou « Je ne suis pas disponible ».")}
    ${d("Je veux changer mes qualifications","Sur l'écran d'accueil, touchez <b>🛠 Mes qualifications</b>, modifiez jusqu'à 3 choix puis enregistrez.")}
    ${d("J'ai oublié mon mot de passe","Contactez l'agence : elle réinitialise votre accès et vous remet un nouveau code d'activation. Vous recréerez ensuite votre compte avec le même numéro de téléphone.")}
    ${d("Comment installer l'application sur mon téléphone ?","<b>iPhone (Safari)</b> : touchez le bouton Partager, puis « Sur l'écran d'accueil ».<br><b>Android (Chrome)</b> : menu ⋮, puis « Installer l'application » ou « Ajouter à l'écran d'accueil ».")}`;
  const agence = `
    <p class="aide">Vous êtes l'agence (ou un commercial) : voici le parcours.</p>
    ${d("Enregistrer un nouvel intérimaire","Onglet <b>Intérimaires</b> : saisissez nom, prénom, téléphone (et qualifications / pièce d'identité si besoin), puis « Enregistrer et envoyer au contrôle Préfecture ». Quand la Préfecture a répondu, touchez <b>Préfecture OK</b> ou <b>NON OK</b> sur sa fiche. Avec « OK », un <b>code d'activation</b> s'affiche : communiquez-le-lui (de vive voix ou par SMS) après avoir vérifié son identité. Le code est valable 7 jours ; au-delà, générez un « Nouveau code ».")}
    ${d("Importer ma liste Excel / CSV","Onglet <b>Intérimaires</b>, bloc « Importer une liste ». Colonnes reconnues : Nom, Prénom, Téléphone (obligatoires), Qualification, CI, Préfecture (facultatives). Vous voyez un aperçu avant de valider ; les numéros déjà présents sont ignorés.")}
    ${d("Chercher un intérimaire disponible","Onglet <b>Recherche</b> : choisissez la qualification et la date « À partir du », puis lancez la recherche. Les <b>Disponibles</b> ont une déclaration valide à cette date ; les <b>À vérifier</b> doivent être recontactés.")}
    ${d("Confirmer sa disponibilité pour un chantier","Sur la fiche d'un intérimaire, touchez « Confirmer via la messagerie », indiquez la ville, la durée et la date de début, puis envoyez. Sa réponse apparaît dans l'onglet <b>Messagerie</b> (pastille rouge = nouvelle réponse).")}
    ${d("Un intérimaire a oublié son mot de passe","Onglet <b>Intérimaires</b> : touchez « Réinitialiser l'accès » sur sa fiche : un nouveau code d'activation s'affiche, à lui communiquer. Il recréera son compte avec le même numéro.")}
    ${d("Ajouter un commercial à l'équipe","Onglet <b>Intérimaires</b>, en bas : section « Équipe agence ». Ajoutez son nom et son téléphone, puis remettez-lui le code d'activation. Il créera son compte depuis l'écran de connexion habituel.")}
    ${d("Je ne vois pas un intérimaire dans la recherche","Il n'apparaît que si : son dossier est « Préfecture OK », il a activé son compte, sa déclaration de disponibilité est valide à la date cherchée, et l'une de ses (jusqu'à 3) qualifications correspond.")}`;
  return `<div class="modal-fond"><div class="modal"><h2 style="margin-top:0">❓ Aide</h2>
    ${estAgence?`<div class="onglets"><button class="${tab==='interim'?'actif':''}" data-act="aide-tab" data-tab="interim">Intérimaire</button><button class="${tab==='agence'?'actif':''}" data-act="aide-tab" data-tab="agence">Agence</button></div>`:''}
    ${tab==='agence'?agence:interim}
    <button class="btn" data-act="fermer-modal">Fermer</button></div></div>`;
}

const nbNonLusI = () => Store.all('demandes').filter(d=>d.tel===S.tel && !d.readI).length;
function vInterim(){
  const u = me();
  if(!u) return `<main class="accueil"><div>${LOGO}</div><p class="aide">Chargement de votre espace…</p><button class="btn gris" data-act="logout">Quitter</button></main>`;
  if(S.view==='i-msg') return vInterimMsg();
  if(S.view==='i-qualifs') return vInterimQualifs();
  const st = u.status;
  const f = S.form;
  const e = etat(u);
  const cur = e==='expire' ? `<div class="msg err">⛔ Faute de mise à jour, vous êtes considéré <b>Non disponible</b> par l'agence. Indiquez votre disponibilité ci-dessous.</div>`
            : e==='verifier' ? `<div class="msg err">⚠️ Votre dernière déclaration a expiré. L'agence vous voit « <b>À vérifier</b> » : sans mise à jour sous ${GRACE_JOURS} jours, vous passerez Non disponible.</div>`
            : e==='dispo' ? `<div class="msg ok">Statut actuel : <b>Disponible</b> depuis le <b>${fmtDate(u.from)}</b> — valable jusqu'au <b>${fmtDate(validUntil(u))}</b></div>`
            : e==='futur' ? `<div class="msg ok">Statut actuel : <b>Disponible</b> à partir du <b>${fmtDate(u.from)}</b> — valable jusqu'au <b>${fmtDate(validUntil(u))}</b></div>`
            : e==='indispo' ? `<div class="msg err">Statut actuel : <b>Non disponible</b> jusqu'au <b>${fmtDate(u.from)}</b></div>`
            : `<div class="msg info">Vous n'avez pas encore indiqué votre disponibilité.</div>`;
  const msg = S.msg ? `<div class="msg ${S.msg.t}">${esc(S.msg.m)}</div>` : '';
  const choix = f.choix || st || '';
  const dDispo = f.dDispo ?? (st==='dispo' ? u.from : today());
  const dIndispo = f.dIndispo ?? (st==='indispo' ? u.from : '');
  return header(`${u.prenom} ${u.nom}`, qtxt(u), nbNonLusI()) + `<main>
  <button class="btn btn-messagerie" data-act="goto-msg">✉️ Messagerie ${nbNonLusI()?`<span class="badge bleu">${nbNonLusI()} nouveau(x)</span>`:''}</button>
  ${!qs(u).length ? `<div class="msg info">Indiquez vos qualifications pour que l'agence puisse vous trouver : touchez « Mes qualifications » en bas de page.</div>` : ''}
  <h2>Indiquer ici votre disponibilité</h2>
  ${cur}${msg}
  <div class="carte-statut vert ${choix==='dispo'?'actif':''}"><div class="gros" data-act="choix" data-v="dispo">✅ Disponible</div>
    <div class="date"><span>À partir du</span><input type="date" id="d-dispo" value="${esc(dDispo)}" min="${today()}"></div>
    <div class="date"><span>Valable jusqu'au</span><input type="date" id="d-until" value="${esc(f.dUntil ?? (st==='dispo'?(u.until||''):''))}" min="${today()}"></div>
    <p class="aide" style="margin:6px 0 0;font-size:12px">Facultatif. Sans date, votre disponibilité reste valable ${VALIDITE_JOURS} jours, puis vous apparaîtrez « À vérifier ».</p></div>
  <div class="carte-statut rouge ${choix==='indispo'?'actif':''}"><div class="gros" data-act="choix" data-v="indispo">⛔ Non disponible</div>
    <div class="date"><span>Jusqu'au</span><input type="date" id="d-indispo" value="${esc(dIndispo)}" min="${today()}"></div></div>
  <button class="btn vert" data-act="save-dispo" ${choix?'':'disabled style="opacity:.5"'}>Enregistrer ma disponibilité</button>
  <button class="btn" data-act="goto-qualifs" style="margin-top:22px">🛠 Mes qualifications : ${esc(qtxt(u))}</button>
  ${pied()}</main>`;
}
function vInterimQualifs(){
  const u = me();
  return header('Mes qualifications', `${u.prenom} ${u.nom}`, nbNonLusI()) + `<main>
  <button class="btn petit gris" data-act="goto-home">← Retour</button>
  <p class="aide" style="margin-top:12px">Indiquez jusqu'à 3 qualifications. L'agence vous trouvera dans ses recherches pour chacune d'elles.</p>
  ${S.msg?`<div class="msg ${S.msg.t}">${esc(S.msg.m)}</div>`:''}
  ${qSelects('mq','mq',S.form)}
  <button class="btn vert" data-act="save-qualifs">Enregistrer mes qualifications</button>${pied()}</main>`;
}
function vInterimMsg(){
  const u = me();
  const list = Store.all('demandes').filter(d=>d.tel===S.tel).sort((a,b)=>b.ts-a.ts);
  const items = list.map(d=>`<div class="item ${!d.readI?'non-lu':''}">
    <div class="ligne"><div class="nom">Demande de l'agence</div><span class="badge ${d.status==='oui'?'vert':d.status==='non'?'rouge':'orange'}">${d.status==='oui'?'Confirmée':d.status==='non'?'Indisponible':'À confirmer'}</span></div>
    <div class="sous">📍 <b>${esc(d.ville)}</b> · ⏱ <b>${esc(d.duree)}</b> · dès le <b>${fmtDate(d.debut)}</b><br>Reçu le ${new Date(d.ts).toLocaleDateString('fr-FR')} à ${new Date(d.ts).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}</div>
    ${d.status==='pending' ? `<label>Commentaire (facultatif)</label><input data-comment="${esc(d.id)}" maxlength="120" placeholder="Ex : dispo à partir de 8h">
      <div class="actions"><button class="btn vert petit" data-act="repondre" data-id="${esc(d.id)}" data-r="oui">Je confirme ma disponibilité</button><button class="btn petit" style="color:var(--rouge);border-color:var(--rouge)" data-act="repondre" data-id="${esc(d.id)}" data-r="non">Je ne suis pas disponible</button></div>`
      : (d.comment?`<div class="sous">Votre commentaire : « ${esc(d.comment)} »</div>`:'')}
  </div>`).join('');
  return header('Messagerie', `${u.prenom} ${u.nom}`, nbNonLusI()) + `<main>
  <button class="btn petit gris" data-act="goto-home">← Retour</button>
  <p class="aide">Cette messagerie sert uniquement à confirmer votre disponibilité selon la durée et le lieu du chantier.</p>
  ${S.msg?`<div class="msg ${S.msg.t}">${esc(S.msg.m)}</div>`:''}
  <div class="liste">${items || '<div class="vide">Aucun message pour le moment.</div>'}</div></main>`;
}

/* ----- Espace agence (page 5 du PDF) ----- */
const nbNonLusA = () => Store.all('demandes').filter(d=>!d.readA).length;
function validUntil(u){ return u.status==='dispo' ? (u.until || addDays(isoOf(u.updatedAt), VALIDITE_JOURS)) : null; }
/* État à une date : dispo | futur | indispo | verifier | expire | null */
function etat(u, ref){
  ref = ref || today();
  if(!u.registered || u.pref!=='ok' || !u.status || !u.from) return null;
  if(u.status==='dispo'){
    const vu = validUntil(u);
    if(ref>addDays(vu,GRACE_JOURS)) return 'expire';
    if(ref>vu) return 'verifier';
    return ref>=u.from ? 'dispo' : 'futur';
  }
  if(ref<=u.from) return 'indispo';
  return ref<=addDays(u.from,GRACE_JOURS) ? 'verifier' : 'expire';
}
function vAgence(){
  const nb = nbNonLusA();
  const nav = `<nav class="bas">
    <button class="${S.view==='a-recherche'?'actif':''}" data-act="view" data-v="a-recherche"><span class="ic">🔎</span>Recherche</button>
    <button class="${S.view==='a-msg'?'actif':''}" data-act="view" data-v="a-msg"><span class="ic">✉️</span>Messagerie${nb?`<span class="pastille">${nb}</span>`:''}</button>
    <button class="${S.view==='a-equipe'?'actif':''}" data-act="view" data-v="a-equipe"><span class="ic">👷</span>Intérimaires</button></nav>`;
  let body = '';
  if(S.view==='a-msg') body = vAgenceMsg();
  else if(S.view==='a-equipe') body = vAgenceEquipe();
  else body = vAgenceRecherche();
  return header('Agence','Recherche de disponibilités', nb) + `<main>${body}${pied()}</main>${nav}`;
}
function vAgenceRecherche(){
  const s = S.search;
  const q = ['<option value="">Toutes qualifications</option>'].concat(allQualifs().map(x=>`<option ${s.qualif===x?'selected':''}>${esc(x)}</option>`)).join('');
  let res = '';
  if(s.done){
    const base = Store.all('interim').filter(u => !s.qualif || qs(u).includes(s.qualif));
    const rang = u => (s.qualif && qs(u)[0]===s.qualif) ? 0 : 1; // qualification principale d'abord
    const tri = (a,b) => rang(a)-rang(b) || (a.nom||'').localeCompare(b.nom||'');
    const hl = u => qs(u).map(q => (s.qualif && q===s.qualif) ? `<b>${esc(q)}</b>` : esc(q)).join(' / ') || '—';
    const ok = base.filter(u=>etat(u,s.from)==='dispo').sort(tri);
    const ver = base.filter(u=>etat(u,s.from)==='verifier').sort(tri);
    const carte = (u,v) => `<div class="item">
      <div class="ligne"><div><div class="nom">${esc(u.prenom)} ${esc(u.nom)}</div><div class="sous">${hl(u)}${s.qualif ? (rang(u)===0 ? ' <span class="badge bleu">principale</span>' : '') : ''} · ${esc(u.tel)}</div></div><span class="badge ${v?'orange':'vert'}">${v?'À vérifier':'Disponible'}</span></div>
      <div class="sous">${v ? (u.status==='dispo' ? `Sa disponibilité était valable jusqu'au ${fmtDate(validUntil(u))}` : `Annonçait un retour le ${fmtDate(u.from)} — non reconfirmé`) : `Disponible depuis le ${fmtDate(u.from)} (déclaration valable jusqu'au ${fmtDate(validUntil(u))})`}</div>
      <div class="actions"><button class="btn ${v?'':'bleu'} petit" data-act="contact" data-tel="${esc(u.tel)}">✉️ ${v?'Vérifier':'Confirmer'} via la messagerie</button></div></div>`;
    res = `<h2>${ok.length} intérimaire(s) disponible(s)</h2><div class="liste">` + (ok.map(u=>carte(u,false)).join('') || '<div class="vide">Aucun intérimaire disponible avec une déclaration valide pour ces critères.</div>') + `</div>`
        + (ver.length ? `<h2>${ver.length} à vérifier</h2><p class="aide">Leur dernière déclaration ne couvre pas cette date : contactez-les via la messagerie pour confirmer.</p><div class="liste">${ver.map(u=>carte(u,true)).join('')}</div>` : '');
  }
  return `<h1>Recherche…</h1>
  <label>Qualification</label><select id="s-qualif">${q}</select>
  <label>À partir du</label><input type="date" id="s-from" value="${esc(s.from)}">
  <button class="btn vert" data-act="chercher">Recherche de disponibilité</button>
  <p class="aide" style="margin-top:12px">Les intérimaires listés peuvent être contactés via la messagerie pour confirmer la durée de disponibilité et la ville du chantier.</p>${res}`;
}
function vAgenceMsg(){
  const list = Store.all('demandes').sort((a,b)=>b.ts-a.ts);
  const items = list.map(d=>`<div class="item ${!d.readA?'non-lu':''}">
    <div class="ligne"><div><div class="nom">${esc(d.prenom)} ${esc(d.nom)}</div><div class="sous">${esc(d.qualif)} · ${esc(d.tel)}</div></div>
    <span class="badge ${d.status==='oui'?'vert':d.status==='non'?'rouge':'orange'}">${d.status==='oui'?'Confirmé':d.status==='non'?'Indisponible':'En attente'}</span></div>
    <div class="sous">📍 ${esc(d.ville)} · ⏱ ${esc(d.duree)} · dès le ${fmtDate(d.debut)}${d.comment?`<br>💬 « ${esc(d.comment)} »`:''}</div>
    <div class="actions"><button class="btn petit gris" data-act="suppr-demande" data-id="${esc(d.id)}">Supprimer</button></div></div>`).join('');
  return `<h1>Messagerie</h1><p class="aide">Demandes de confirmation envoyées aux intérimaires et leurs réponses.</p>${S.msg?`<div class="msg ${S.msg.t}">${esc(S.msg.m)}</div>`:''}<div class="liste">${items||'<div class="vide">Aucune demande envoyée.</div>'}</div>`;
}

function vImport(){
  const im = S.imp;
  const aide = `<p class="aide">Fichier .xlsx, .xls ou .csv, 1ʳᵉ ligne = en-têtes. Colonnes reconnues : <b>Nom, Prénom, Téléphone</b> (obligatoires), <b>Qualification</b> (jusqu'à 3, séparées par une virgule), <b>CI</b> et <b>Préfecture</b> (OK / NON OK / en cours — facultatives). Sans qualification, l'intérimaire la renseignera lui-même à la création de son compte (jusqu'à 3). Les numéros déjà enregistrés sont ignorés (rien n'est écrasé).</p>`;
  if(!im || im.etape==='choix') return aide + `<label>Statut Préfecture à appliquer si la colonne est absente ou vide</label>
    <select id="imp-pref"><option value="attente" ${(im&&im.pref)==='attente'?'selected':''}>En contrôle Préfecture (48 h)</option><option value="ok" ${(im&&im.pref)==='ok'?'selected':''}>Préfecture OK (déjà validés)</option></select>
    <label>Numéro de pièce d'identité (colonne CI)</label>
    <select id="imp-ci"><option value="fin3" ${(!im||!im.ci||im.ci==='fin3')?'selected':''}>Garder seulement les 3 derniers caractères (recommandé)</option><option value="non" ${(im&&im.ci)==='non'?'selected':''}>Ne pas importer</option><option value="oui" ${(im&&im.ci)==='oui'?'selected':''}>Importer le numéro complet</option></select>
    <p class="aide" style="margin:4px 0 0;font-size:12px">Les 3 derniers caractères suffisent pour comparer avec votre document d'origine ; le numéro complet n'est alors jamais stocké. Moins on stocke de données d'identité, moins il y a de risque (RGPD).</p>
    <label>Fichier</label><input type="file" id="imp-file" accept=".xlsx,.xls,.csv">`;
  if(im.etape==='lecture') return `<div class="msg info">Lecture du fichier…</div>`;
  if(im.etape==='apercu') return `<div class="msg ${im.rows.length?'ok':'err'}"><b>${im.rows.length}</b> à importer · ${im.dupes} déjà présent(s) · ${im.errors.length} ligne(s) refusée(s)</div>
    ${im.rows.length?`<div class="liste">${im.rows.slice(0,5).map(r=>`<div class="item"><div class="nom">${esc(r.prenom)} ${esc(r.nom)}</div><div class="sous">${esc(r.qualifs.join(' / ')||'—')} · ${esc(r.tel)} · ${r.pref==='ok'?'Préfecture OK':r.pref==='nok'?'Préfecture NON OK':'En contrôle'}</div></div>`).join('')}${im.rows.length>5?`<div class="vide">… et ${im.rows.length-5} autre(s)</div>`:''}</div>`:''}
    ${im.errors.length?`<div class="msg err">Lignes refusées :<br>${im.errors.slice(0,8).map(e=>esc(e)).join('<br>')}${im.errors.length>8?'<br>…':''}</div>`:''}
    ${im.rows.length?`<button class="btn bleu" data-act="imp-go">Importer ${im.rows.length} intérimaire(s)</button>`:''}
    <button class="btn gris" data-act="imp-annuler">Annuler</button>`;
  if(im.etape==='envoi') return `<div class="msg info">Import en cours… ${im.fait}/${im.total}</div>`;
  return aide;
}

function vModal(){
  const m = S.modal;
  if(m.type==='aide') return vAide();
  if(m.type==='contact'){
    const u = Store.one('interim', m.tel); if(!u) return '';
    return `<div class="modal-fond"><div class="modal"><h2 style="margin-top:0">Contacter ${esc(u.prenom)} ${esc(u.nom)}</h2>
    <p class="aide">Précisez le chantier pour que l'intérimaire confirme sa disponibilité.</p>
    <label>Ville du chantier</label><input id="c-ville" placeholder="Ex : Lyon">
    <label>Durée de la mission</label><input id="c-duree" placeholder="Ex : 3 semaines">
    <label>Date de début</label><input id="c-debut" type="date" value="${esc(S.search.from)}">
    ${m.err?`<div class="msg err">${esc(m.err)}</div>`:''}
    <button class="btn bleu" data-act="envoyer-demande" data-tel="${esc(m.tel)}">Envoyer la demande</button>
    <button class="btn gris" data-act="fermer-modal">Annuler</button></div></div>`;
  }
  return '';
}


/* ---------- Actions ---------- */
const val = id => { const e=document.getElementById(id); return e ? e.value.trim() : ''; };
let busy = false;
document.addEventListener('click', async ev => {
  const el = ev.target.closest('[data-act]'); if(!el) return;
  const act = el.dataset.act;
  if(busy) return; busy = true;
  try{ await actions[act]?.(el); }catch(e){ console.warn(e); go({msg:{t:'err',m:"Une erreur est survenue. Réessayez."}}); }
  finally{ busy = false; }
});
document.addEventListener('input', ev => {
  const t = ev.target;
  if(t.id==='d-dispo') S.form.dDispo = t.value, S.form.choix='dispo';
  if(t.id==='d-indispo') S.form.dIndispo = t.value, S.form.choix='indispo';
  if(t.id==='d-until') S.form.dUntil = t.value, S.form.choix='dispo';
  if(t.id==='s-qualif') S.search.qualif = t.value;
  if(t.id==='s-from') S.search.from = t.value;
});

const err = m => ({ t:'err', m });
const ok = m => ({ t:'ok', m });

const actions = {
  acces(){ go({ view:'auth', authTab:'connexion', msg:null, form:{} }); },
  'retour-accueil'(){ go({ view:'accueil', msg:null, form:{} }); },
  async logout(){ try{ await signOut(auth); }catch(e){} Store.stop(); go({ role:null, tel:null, uid:null, view:'accueil', msg:null, form:{}, modal:null, loading:false }); },
  tab(el){ go({ authTab:el.dataset.tab, msg:null }); },

  async login(){
    const tel = normPhone(val('f-tel')), pw = val('f-pw');
    S.form.tel = val('f-tel');
    if(tel.length!==10 || !pw) return go({ msg: err("Renseignez votre numéro (10 chiffres) et votre mot de passe.") });
    go({ loading:true, msg:null });
    try{ await signInTel(tel, pw); }          // la suite est gérée par onAuthStateChanged
    catch(e){ go({ loading:false, msg: err(errMsg(e)) }); }
  },

  async register(){
    const tel = normPhone(val('f-tel')), code = val('f-code').toUpperCase().replace(/[^A-Z0-9]/g,''), pw = val('f-pw'), pw2 = val('f-pw2');
    S.form = { tel: val('f-tel') };
    if(tel.length!==10 || code.length!==8) return go({ msg: err("Renseignez votre numéro (10 chiffres) et le code d'activation à 8 caractères remis par l'agence.") });
    if(pw.length<8) return go({ msg: err("Le mot de passe doit contenir au moins 8 caractères.") });
    if(pw!==pw2) return go({ msg: err("Les deux mots de passe ne correspondent pas.") });
    registering = true; go({ loading:true, msg:null });
    let user = null, usedV = 1;
    try{
      for(let v=1; v<=6 && !user; v++){
        try{ const c = await createUserWithEmailAndPassword(auth, mail(tel, v), pw); user = c.user; usedV = v; }
        catch(e){ if(e.code!=='auth/email-already-in-use') throw e; }
      }
      if(!user) throw { code:'dpd/trop-de-comptes' };
      let claimed = false; const dbg = [];
      for(const [coll, role] of [['interim','interim'], ['staff','agence']]){
        try{
          const b = writeBatch(db);
          b.update(doc(db, coll, tel), { uid:user.uid, registered:true, activationCode:code });
          b.set(doc(db, 'roles', user.uid), { role, tel });
          await b.commit(); claimed = true; break;
        }catch(e){ dbg.push(coll+':'+(e.code||e.message)); if(e.code!=='permission-denied' && e.code!=='not-found') throw e; }
      }
      if(!claimed){
        await deleteUser(user); registering = false;
        return go({ loading:false, msg: err("Création impossible : numéro inconnu, code incorrect ou expiré, ou compte déjà activé. Vérifiez auprès de l'agence. [détail : "+dbg.join(' | ')+"]") });
      }
      try{ localStorage.setItem('dpd_v_'+tel, String(usedV)); }catch(e){}
      registering = false;
      await enter(user);
    }catch(e){
      registering = false;
      try{ if(user) await deleteUser(user); }catch(_){}
      go({ loading:false, msg: err(errMsg(e)) });
    }
  },

  'goto-msg'(){ if(S.role==='interim'){ go({ view:'i-msg', msg:null }); markReadI(); } else { go({ view:'a-msg', msg:null }); markReadA(); } },
  'goto-home'(){ go({ view:'i-home', msg:null, form:{} }); },
  'goto-qualifs'(){ const q = qs(me()); go({ view:'i-qualifs', msg:null, form:{ mq1:q[0]||'', mq2:q[1]||'', mq3:q[2]||'' } }); },
  async 'save-qualifs'(){
    const q = readQ('mq');
    S.form = { mq1:q[0]||'', mq2:q[1]||'', mq3:q[2]||'' };
    if(!q.length) return go({ msg: err("Indiquez au moins une qualification.") });
    await Store.patch('interim', S.tel, { qualifs:q, qualif:q[0] });
    go({ view:'i-home', form:{}, msg: ok("Qualifications mises à jour ✔") });
  },
  choix(el){ S.form.choix = el.dataset.v; if(el.dataset.v==='dispo' && !S.form.dDispo) S.form.dDispo = today(); go({ msg:null }); },
  async 'save-dispo'(){
    const choix = S.form.choix || (me()||{}).status;
    if(!choix) return;
    const d = choix==='dispo' ? val('d-dispo') : val('d-indispo');
    if(!d) return go({ msg: err(choix==='dispo' ? "Indiquez la date de début de votre disponibilité." : "Indiquez la date à partir de laquelle vous serez à nouveau disponible.") });
    const until = choix==='dispo' ? val('d-until') : '';
    if(until && until < d) return go({ msg: err("La date de fin de validité ne peut pas précéder la date de début.") });
    await Store.patch('interim', S.tel, { status:choix, from:d, until:until||'', updatedAt:Date.now() });
    go({ form:{}, msg: ok("Disponibilité enregistrée ✔") });
  },
  async repondre(el){
    const id = el.dataset.id;
    const c = document.querySelector(`[data-comment="${CSS.escape(id)}"]`);
    await Store.patch('demandes', id, { status:el.dataset.r, comment:c?c.value.trim():'', readI:true, readA:false, repTs:Date.now() });
    go({ msg: ok("Réponse envoyée à l'agence ✔") });
  },

  view(el){ go({ view:el.dataset.v, msg:null }); if(el.dataset.v==='a-msg') markReadA(); },
  chercher(){ S.search.qualif = val('s-qualif'); S.search.from = val('s-from') || today(); S.search.done = true; go({}); },
  contact(el){ go({ modal:{ type:'contact', tel:el.dataset.tel } }); },
  'fermer-modal'(){ go({ modal:null }); },
  aide(){ go({ modal:{ type:'aide' }, aideTab: S.role==='agence' ? 'agence' : 'interim' }); },
  'aide-tab'(el){ go({ aideTab:el.dataset.tab }); },
  async 'envoyer-demande'(el){
    const ville = val('c-ville'), duree = val('c-duree'), debut = val('c-debut');
    if(!ville || !duree || !debut){ S.modal.err = "Renseignez la ville, la durée et la date de début."; return go({}); }
    const u = Store.one('interim', el.dataset.tel);
    const id = 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2,6);
    await Store.set('demandes', id, { tel:u.tel, nom:u.nom, prenom:u.prenom, qualif:qtxt(u), ville, duree, debut, ts:Date.now(), status:'pending', comment:'', readI:false, readA:true });
    go({ modal:null, view:'a-msg', msg: ok(`Demande envoyée à ${u.prenom} ${u.nom} ✔`) });
  },
  async 'suppr-demande'(el){ await Store.del('demandes', el.dataset.id); go({}); },

  /* ----- agence : intérimaires ----- */
  async 'add-interim'(){
    const nn = val('n-nom'), np = val('n-prenom'), nt = val('n-tel'), nqs = readQ('n-q'), nc = val('n-ci');
    S.form = { nn, np, nt, nc, nq1:nqs[0]||'', nq2:nqs[1]||'', nq3:nqs[2]||'' };
    const tel = normPhone(nt);
    if(!nn || !np || tel.length!==10) return go({ msg: err("Renseignez nom, prénom et un n° de téléphone valide (10 chiffres).") });
    if(Store.one('interim', tel) || Store.one('staff', tel)) return go({ msg: err("Ce numéro est déjà enregistré.") });
    await Store.set('interim', tel, { tel, nom:nn, prenom:np, qualifs:nqs, qualif:nqs[0]||'', ci:String(nc||'').replace(/\s/g,'').slice(-3), pref:'attente', registered:false, uid:null, status:null, from:null, createdAt:Date.now() });
    go({ form:{}, msg: ok(`${np} ${nn} envoyé au contrôle Préfecture (réponse sous 48 h).`) });
  },
  async pref(el){
    const tel = el.dataset.tel, v = el.dataset.v, b = writeBatch(db);
    b.update(doc(db,'interim',tel), { pref:v });
    if(v==='ok') b.set(doc(db,'activation',tel), newActivation('interim')); else b.delete(doc(db,'activation',tel));
    await b.commit(); go({ msg:null });
  },
  async 'gen-code'(el){
    await Store.set('activation', el.dataset.tel, newActivation(el.dataset.kind));
    go({ msg: ok("Nouveau code généré : communiquez-le à la personne concernée.") });
  },
  async 'reset-acces'(el){
    const tel = el.dataset.tel, kind = el.dataset.kind, coll = kind==='staff' ? 'staff' : 'interim';
    const fiche = Store.one(coll, tel); if(!fiche) return;
    if(coll==='staff' && fiche.uid===S.uid) return;
    const b = writeBatch(db);
    b.update(doc(db,coll,tel), coll==='staff' ? { uid:null, registered:false, activationCode:'' } : { uid:null, registered:false, status:null, from:null, until:'', activationCode:'' });
    if(fiche.uid) b.delete(doc(db,'roles',fiche.uid));
    b.set(doc(db,'activation',tel), newActivation(kind));
    await b.commit();
    go({ msg: ok("Accès réinitialisé : un nouveau code d'activation est affiché sur la fiche. Communiquez-le à la personne pour qu'elle recrée son compte.") });
  },
  async 'suppr-interim'(el){
    const tel = el.dataset.tel, fiche = Store.one('interim', tel);
    const b = writeBatch(db);
    b.delete(doc(db,'interim',tel)); b.delete(doc(db,'activation',tel));
    if(fiche && fiche.uid) b.delete(doc(db,'roles',fiche.uid));
    Store.all('demandes').filter(d=>d.tel===tel).forEach(d => b.delete(doc(db,'demandes',d.id)));
    await b.commit(); go({});
  },

  /* ----- agence : équipe ----- */
  async 'add-staff'(){
    const sn = val('s-nom'), sp = val('s-prenom'), st = val('s-tel');
    S.form = { ...S.form, sn, sp, st };
    const tel = normPhone(st);
    if(!sn || !sp || tel.length!==10) return go({ msg: err("Renseignez nom, prénom et un n° de téléphone valide (10 chiffres).") });
    if(Store.one('interim', tel) || Store.one('staff', tel)) return go({ msg: err("Ce numéro est déjà enregistré.") });
    const b = writeBatch(db);
    b.set(doc(db,'staff',tel), { tel, nom:sn, prenom:sp, uid:null, registered:false, createdAt:Date.now() });
    b.set(doc(db,'activation',tel), newActivation('staff'));
    await b.commit();
    go({ form:{ ...S.form, sn:'', sp:'', st:'' }, msg: ok(`${sp} ${sn} ajouté : remettez-lui le code d'activation affiché sur sa fiche.`) });
  },
  async 'suppr-staff'(el){
    const tel = el.dataset.tel, fiche = Store.one('staff', tel);
    if(!fiche || fiche.uid===S.uid) return;
    const b = writeBatch(db);
    b.delete(doc(db,'staff',tel)); b.delete(doc(db,'activation',tel));
    if(fiche.uid) b.delete(doc(db,'roles',fiche.uid));
    await b.commit(); go({});
  },

  /* ----- import Excel / CSV ----- */
  'imp-annuler'(){ go({ imp:null }); },
  async 'imp-go'(){
    const rows = S.imp.rows, total = rows.length; let fait = 0, ko = 0;
    for(const r of rows){
      try{
        if(!Store.one('interim', r.tel) && !Store.one('staff', r.tel)){
          const b = writeBatch(db);
          b.set(doc(db,'interim',r.tel), { ...r, registered:false, uid:null, status:null, from:null, createdAt:Date.now() });
          if(r.pref==='ok') b.set(doc(db,'activation',r.tel), newActivation('interim'));
          await b.commit();
        }
      }catch(e){ ko++; console.warn(e); }
      fait++;
      if(fait%5===0 || fait===total){ S.imp = { ...S.imp, etape:'envoi', fait, total }; go({}); }
    }
    go({ imp:null, msg: ko ? err(`${total-ko} importé(s), ${ko} en échec — relancez l'import : les numéros déjà présents sont ignorés.`) : ok(`${total} intérimaire(s) importé(s) ✔`) });
  }
};

async function markReadI(){ for(const d of Store.all('demandes').filter(d=>d.tel===S.tel && !d.readI)) { try{ await Store.patch('demandes', d.id, { readI:true }); }catch(e){} } }
async function markReadA(){ for(const d of Store.all('demandes').filter(d=>!d.readA)) { try{ await Store.patch('demandes', d.id, { readA:true }); }catch(e){} } }

const normKey = k => String(k||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
const COLS = { nom:['nom','nomdefamille'], prenom:['prenom'], tel:['tel','telephone','portable','mobile','numerodetelephone','notel','ndetelephone','numtel'], qualif:['qualification','qualif','metier','poste','fonction'], ci:['ci','cni','pieceidentite','pieceididentite','numeroci','nci'], pref:['prefecture','statutprefecture','statut','controleprefecture'] };
function normPhone(v){ let d = digits(v); if(d.startsWith('0033')) d='0'+d.slice(4); else if(d.startsWith('33') && d.length===11) d='0'+d.slice(2); if(d.length===9) d='0'+d; return d; }
function parsePref(v, defaut){ const k=normKey(v); if(!k) return defaut; if(k.includes('nonok')||k==='nok'||k.includes('refus')||k.includes('non')) return 'nok'; if(k==='ok'||k.includes('valid')||k.includes('oui')) return 'ok'; return 'attente'; }
document.addEventListener('change', async ev => {
  const t = ev.target;
  if(t.id==='imp-pref'){ S.imp = { ...(S.imp||{}), etape:'choix', pref:t.value }; return; }
  if(t.id==='imp-ci'){ S.imp = { ...(S.imp||{}), etape:'choix', ci:t.value }; return; }
  if(t.id!=='imp-file' || !t.files[0]) return;
  const defaut = (document.getElementById('imp-pref')||{}).value || 'attente';
  const modeCI = (document.getElementById('imp-ci')||{}).value || 'fin3';
  if(!window.XLSX){ return go({msg:{t:'err',m:"Le lecteur Excel n'a pas pu se charger. Rechargez la page ou utilisez un fichier .csv."}}); }
  const file = t.files[0];
  go({imp:{etape:'lecture', pref:defaut, ci:modeCI}, msg:null});
  try{
    const buf = await file.arrayBuffer();
    let wb;
    if(/\.(csv|txt)$/i.test(file.name)){
      let txt = new TextDecoder('utf-8').decode(buf).replace(/^\uFEFF/,'');
      if(txt.includes('\uFFFD')) txt = new TextDecoder('windows-1252').decode(buf); // CSV Excel ancien (ANSI)
      const l1 = txt.split(/\r?\n/)[0] || '';
      const fs = (l1.split(';').length > l1.split(',').length) ? ';' : (l1.split('\t').length > l1.split(',').length ? '\t' : ',');
      wb = XLSX.read(txt, {type:'string', FS:fs});
    } else wb = XLSX.read(buf, {type:'array'});
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {defval:'', raw:false});
    const out=[], errors=[], seen=new Set(); let dupes=0;
    rows.forEach((r,i)=>{
      const m={}; Object.keys(r).forEach(k=>{ const nk=normKey(k); for(const f in COLS){ if((COLS[f].includes(nk) || (f==='ci' && (nk.includes('identite')||nk.includes('piece')||nk.includes('cni')))) && m[f]===undefined) m[f]=String(r[k]).trim(); } });
      const ligne = i+2;
      if(!m.nom && !m.prenom && !m.tel) return;
      const tel = normPhone(m.tel);
      if(!m.nom || !m.prenom) return errors.push(`Ligne ${ligne} : nom ou prénom manquant`);
      if(tel.length!==10) return errors.push(`Ligne ${ligne} (${m.prenom} ${m.nom}) : téléphone invalide « ${m.tel||''} »`);
      if(Store.one('interim', tel) || seen.has(tel)){ dupes++; return; }
      seen.add(tel);
      out.push({tel, nom:m.nom, prenom:m.prenom, qualifs:splitQ(m.qualif), qualif:splitQ(m.qualif)[0]||'', ci: modeCI==='oui' ? (m.ci||'') : modeCI==='fin3' ? String(m.ci||'').replace(/\s/g,'').slice(-3) : '', pref:parsePref(m.pref, defaut)});
    });
    go({imp:{etape:'apercu', rows:out, errors, dupes, pref:defaut, ci:modeCI}});
  }catch(e){ console.warn(e); go({imp:null, msg:{t:'err',m:"Fichier illisible. Vérifiez qu'il s'agit bien d'un fichier Excel ou CSV."}}); }
});

/* ---------- Authentification ---------- */
function errMsg(e){
  const c = e && e.code;
  if(c==='auth/invalid-credential' || c==='auth/wrong-password' || c==='auth/user-not-found') return "Numéro ou mot de passe incorrect. Pas encore de compte ? Utilisez « Créer mon compte » avec le code d'activation donné par l'agence.";
  if(c==='auth/too-many-requests') return "Trop de tentatives. Patientez quelques minutes avant de réessayer.";
  if(c==='auth/network-request-failed' || c==='unavailable') return "Pas de connexion à Internet. Réessayez dans un instant.";
  if(c==='auth/weak-password') return "Mot de passe trop faible : 8 caractères minimum.";
  if(c==='dpd/trop-de-comptes') return "Création impossible pour ce numéro. Contactez l'agence.";
  return "Une erreur est survenue. Réessayez.";
}
async function signInTel(tel, pw){
  const pref = Number(localStorage.getItem('dpd_v_'+tel)) || 1;
  const order = [pref, ...[1,2,3,4,5,6].filter(v => v !== pref)];
  let last = null;
  for(const v of order){
    try{ const c = await signInWithEmailAndPassword(auth, mail(tel, v), pw); try{ localStorage.setItem('dpd_v_'+tel, String(v)); }catch(e){} return c; }
    catch(e){ last = e; if(e.code==='auth/too-many-requests' || e.code==='auth/network-request-failed') throw e; }
  }
  throw last || { code:'auth/invalid-credential' };
}
async function enter(user){
  const snap = await getDoc(doc(db, 'roles', user.uid));
  if(!snap.exists()) return false;
  const { role, tel } = snap.data();
  Store.start(role, tel);
  go({ role, tel, uid:user.uid, view: role==='agence' ? 'a-recherche' : 'i-home', loading:false, msg:null, form:{}, modal:null });
  return true;
}
onAuthStateChanged(auth, async user => {
  if(registering) return;
  if(!user){ Store.stop(); go({ loading:false, role:null, tel:null, uid:null, view:'accueil', form:{}, modal:null }); return; }
  try{
    if(!(await enter(user))){ await signOut(auth); go({ loading:false, role:null, view:'accueil' }); }
  }catch(e){ console.warn(e); go({ loading:false, role:null, view:'accueil', msg:{t:'err', m:errMsg(e)} }); }
});

/* sécurité : si Firebase ne répond pas (hors ligne), on sort de l'écran de chargement */
setTimeout(()=>{ if(S.loading && !S.role){ go({ loading:false }); } }, 8000);
render();
