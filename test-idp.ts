import { generateIdpBuffer, type IdpData, type IdpAssets, type PillarKey } from './lib/idp-template';
import * as fs from 'fs';
import * as path from 'path';

function dataUrl(file: string): string {
  const p = path.join(process.cwd(), 'public', 'idp', file);
  return `data:image/png;base64,${fs.readFileSync(p).toString('base64')}`;
}

const assets: IdpAssets = {
  logoDataUrl: dataUrl('tl-logo.png'),
  iconDataUrls: {
    physis: dataUrl('icon-physis.png'),
    technik: dataUrl('icon-technik.png'),
    taktik: dataUrl('icon-taktik.png'),
    mental: dataUrl('icon-mental.png'),
  } as Record<PillarKey, string>,
};

// Exact content from the reference IDP_BABIC-Leon.pdf for 1:1 layout verification.
const data: IdpData = {
  name: 'Babic Leon',
  position: 'Mittelstürmer',
  geburtsdatum: '06.11.2009',
  liga: 'U17 ELITE LIGA (U17 - SCHWEIZ)',
  spiele: ['16.08.2025 vs. FC Luzern U17'],
  physis: {
    staerken: [
      'Verfügt über gute körperliche Voraussetzungen dank seiner Größe und robusten Statur, wodurch er sich als Wandspieler effektiv einbringen kann.',
      'Kann Bälle gut festmachen und so für die Mannschaft sichern, um Anschlussaktionen einzuleiten.',
    ],
    entwicklung: [
      'Es fehlt noch an Explosivität auf den ersten Metern sowie an Geschwindigkeit auf mittlerer Distanz.',
      'Arbeitet bereits gut mit dem Rücken zum Tor, sollte jedoch vermehrt auch seitlich stehen, um den Gegner auf Distanz zum Ball zu halten. Besonders im Übergang in den Herrenfußball ist dies wichtig, da er dort auf physisch ebenbürtige und erfahrene Verteidiger treffen wird.',
    ],
  },
  technik: {
    staerken: [
      'Hatte gegen Luzern in den beobachteten 45 Minuten nicht besonders viele Ballaktionen, dennoch zeigte er gutes Ablegen der Bälle sowie einen soliden Abschluss in der Box.',
      'Auch im Kopfballspiel wirkt er stabil und gefährlich.',
    ],
    entwicklung: [
      'In diesem Spiel keine Schwächen identifiziert – technische Konstanz weiterhin beobachten, da nur 45 Minuten gesehen wurden.',
    ],
  },
  taktik: {
    staerken: [
      'Bewegt sich gut in der Box und sucht aktiv den toten Winkel des Verteidigers.',
      'Zeigt zielgerichtete Läufe in die Box und sorgt für Präsenz im Strafraum.',
      'Arbeitet defensiv mit und presst die Innenverteidiger bzw. den Torhüter im gegnerischen Spielaufbau aggressiv an.',
    ],
    entwicklung: [
      'Soll sich als Wandspieler gezielter anspielbar machen im Spielaufbau – aktuell versteckt er sich häufig zwischen den Innenverteidigern oder sucht ausschließlich die Tiefe, obwohl seine Stärke im Ballfestmachen liegt.',
      'Seine Bewegungen in der Box sind bereits gut für das aktuelle Niveau, doch gegen stärkere Verteidiger sollte er mehr Körperfinten in seinen Freilaufbewegungen einbauen, um sich zusätzlichen Raum im Strafraum zu verschaffen.',
    ],
  },
  mental: {
    staerken: [
      'Zeigt eine mannschaftsdienliche Spielweise, indem er sich auch defensiv stark einbringt.',
      'Hohes Laufvolumen und Bereitschaft, für das Team zu arbeiten.',
    ],
    entwicklung: [
      'In diesem Spiel keine klaren Schwächen identifiziert – mentale Konstanz weiterhin beobachten und in Zusammenarbeit mit dem Mental Coach vertiefen, da nur 45 Minuten gesehen wurden.',
    ],
  },
};

(async () => {
  const buf = await generateIdpBuffer(data, assets);
  const out = path.join(process.cwd(), 'test-idp.pdf');
  fs.writeFileSync(out, buf);
  console.log(`✓ Wrote ${out} (${buf.length} bytes)`);
})().catch((err) => {
  console.error('IDP generation failed:', err);
  process.exit(1);
});
