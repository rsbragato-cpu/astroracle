/* =======================================================================
   Raccoglitore di oroscopi da fonti esterne.
   Gira su GitHub Actions una volta al giorno e scrive dati/oroscopi.json
   dentro il deposito. Il sito legge quel file, che è sulla sua stessa
   origine: nessun problema di richieste incrociate.

   Nessuna dipendenza: usa fetch, presente in Node 18 e successivi.
   ======================================================================= */

import { writeFile, mkdir, readFile } from 'node:fs/promises';

const SEGNI = [
  ['ariete','aries'], ['toro','taurus'], ['gemelli','gemini'], ['cancro','cancer'],
  ['leone','leo'], ['vergine','virgo'], ['bilancia','libra'], ['scorpione','scorpio'],
  ['sagittario','sagittarius'], ['capricorno','capricorn'], ['acquario','aquarius'],
  ['pesci','pisces']
];

/* --- misura del tono: crudo ma trasparente -----------------------------
   Conta parole marcate e restituisce un valore fra -1 e +1. Non è analisi
   del sentimento seria: è un conteggio. Serve solo a dire se una fonte
   pende verso l'incoraggiamento o verso la cautela.                     */
const POS = `good great excellent positive lucky luck fortune success successful
  opportunity opportunities joy joyful happy happiness love loving harmony harmonious
  progress growth gain benefit favorable favourable bright confident confidence
  energy energetic strong strength support supportive smooth easy ease reward
  rewarding achieve achievement win winning breakthrough clarity clear inspired
  inspiration creative abundance thrive flourish celebrate optimistic hope hopeful
  welcome pleasant delight excited exciting warm generous`.split(/\s+/);
const NEG = `bad difficult difficulty challenge challenging obstacle obstacles
  conflict tension stress stressful worry worried anxious anxiety fear afraid
  doubt doubtful confusion confused delay delays setback loss lose losing
  frustration frustrated angry anger tired exhausted drain draining careful caution
  cautious avoid risk risky problem problems trouble struggle hard heavy burden
  disappointment disappointed misunderstanding argue argument tense pressure
  overwhelm overwhelmed uncertain uncertainty`.split(/\s+/);

export function tono(testo) {
  const parole = String(testo).toLowerCase().match(/[a-z']+/g) || [];
  let p = 0, n = 0;
  for (const w of parole) { if (POS.includes(w)) p++; else if (NEG.includes(w)) n++; }
  if (!p && !n) return 0;
  return +((p - n) / (p + n)).toFixed(3);
}

/* --- adattatori: uno per fonte ---------------------------------------- */
const FONTI = [

  {
    id: 'api-ninjas',
    nome: 'API Ninjas',
    lingua: 'en',
    attiva: true,
    chiave: 'API_NINJAS_KEY',
    async leggi(segnoEn, chiave) {
      const r = await fetch(`https://api.api-ninjas.com/v1/horoscope?zodiac=${segnoEn}`,
        { headers: { 'X-Api-Key': chiave } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      return j.horoscope;
    }
  },

  /* ---------------------------------------------------------------------
     Le due fonti qui sotto sono SPENTE finché non le hai verificate.
     Prima di accenderle controlla: che il servizio risponda davvero, che
     la licenza consenta l'uso che ne fai, e quale sia il limite di
     richieste. Poi metti attiva: true e sistema l'indirizzo.
     --------------------------------------------------------------------- */

  {
    id: 'fonte-2',
    nome: 'Da definire',
    lingua: 'en',
    attiva: false,
    chiave: 'FONTE2_KEY',
    async leggi(segnoEn, chiave) {
      throw new Error('adattatore non ancora configurato');
    }
  },

  {
    id: 'fonte-3',
    nome: 'Da definire',
    lingua: 'en',
    attiva: false,
    chiave: 'FONTE3_KEY',
    async leggi(segnoEn, chiave) {
      throw new Error('adattatore non ancora configurato');
    }
  }
];

/* --- raccolta ---------------------------------------------------------- */
async function raccogli() {
  const oggi = new Date().toISOString().slice(0, 10);
  const out = { aggiornato: new Date().toISOString(), giorno: oggi, fonti: [] };

  for (const f of FONTI) {
    if (!f.attiva) { console.log(`— ${f.nome}: spenta, salto`); continue; }
    const chiave = process.env[f.chiave];
    if (!chiave) { console.log(`— ${f.nome}: manca il segreto ${f.chiave}, salto`); continue; }

    const segni = {};
    let ok = 0, ko = 0;
    for (const [it, en] of SEGNI) {
      try {
        const testo = await f.leggi(en, chiave);
        if (!testo || typeof testo !== 'string') throw new Error('risposta vuota');
        segni[it] = { testo: testo.trim(), tono: tono(testo) };
        ok++;
      } catch (e) {
        console.log(`   ${f.nome} / ${it}: ${e.message}`);
        ko++;
      }
      await new Promise(r => setTimeout(r, 250));      // gentile con il servizio
    }
    if (ok) {
      out.fonti.push({ id: f.id, nome: f.nome, lingua: f.lingua, segni });
      console.log(`✓ ${f.nome}: ${ok} segni raccolti${ko ? `, ${ko} falliti` : ''}`);
    } else {
      console.log(`✗ ${f.nome}: nessun segno raccolto, la escludo`);
    }
  }

  if (!out.fonti.length) {
    console.log('Nessuna fonte disponibile: non tocco il file esistente.');
    process.exit(0);
  }

  await mkdir('dati', { recursive: true });
  const nuovo = JSON.stringify(out, null, 1);

  let vecchio = '';
  try { vecchio = await readFile('dati/oroscopi.json', 'utf8'); } catch {}
  const senzaData = s => s.replace(/"aggiornato":[^,]+,/, '');
  if (senzaData(vecchio) === senzaData(nuovo)) {
    console.log('Contenuto identico a ieri: non scrivo, così non sporco la cronologia.');
    process.exit(0);
  }

  await writeFile('dati/oroscopi.json', nuovo);
  console.log(`Scritto dati/oroscopi.json · ${out.fonti.length} fonti · ${(nuovo.length/1024).toFixed(1)} KB`);
}

raccogli().catch(e => { console.error('Errore:', e); process.exit(1); });
