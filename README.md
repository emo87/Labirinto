# Labirinto — co-op in prima persona (prototipo v0.2)

Fino a **4 giocatori**, ognuno dal proprio dispositivo (PC o telefono), dentro lo stesso labirinto 3D in prima persona
(stile "Labirinto 3D" di Windows 95/98). **Nessuna mappa**: per orientarvi dovete parlarvi, e la **chat vocale di prossimità**
è integrata nel gioco (si sente bene chi è vicino, meno chi è lontano, attutito se c'è un muro in mezzo). Tono comico.

## Avvio in locale

```bash
npm install
npm start
```

Apri `http://localhost:3000`, crea una stanza e passa il codice (o "Invita amici") agli altri. Servono almeno 2 giocatori.
Il microfono funziona solo su **https** o su `localhost`: online (Render) va bene, in rete locale con l'IP no.
Usate le **cuffie**, altrimenti la voce degli altri rientra nel microfono.

## Comandi

| | PC | Telefono |
|---|---|---|
| Muoversi | W A S D | joystick a sinistra |
| Girarsi | mouse (clic sullo schermo) oppure frecce ← → | trascina a destra |
| Usa (pulsanti, torcia, liberare un amico) | E o Spazio | tasto "Usa" |
| Lasciare la torcia | Q | tasto "Lascia" |
| Urla rapide | 1 2 3 4 | 💬 |
| Muto / voce vicina-tutti | M / pulsanti in alto a destra | pulsanti in alto a destra |

## Come si gioca

- **5 livelli**, sempre più grandi, con temi diversi (Cantina, Supermercato, Ospedale, Castello).
- **Porte a doppio pulsante**: si aprono solo se due giocatori premono due pulsanti diversi entro 1,5 secondi. Restano aperte 8 secondi. Non si possono aggirare.
- **Porta di uscita**: si apre solo quando **tutti** sono vicini; un amico incatenato va prima liberato.
- **Mostro goffo**: ti insegue (inciampa ogni tanto) e se ti tocca ti **incatena**, ma **attacca solo chi è solo**: se hai un compagno libero entro circa 5 tile (due o tre corridoi) non ti tocca e resta lì a brontolare (🥴). Quando ci si divide, per esempio ai due pulsanti, si è in pericolo. Un compagno ti libera tenendo premuto "Usa" vicino a te per 3 secondi, e il mostro resta stordito. Se siete tutti incatenati, il livello ricomincia. Il mostro sfonda le porte.
- **Il labirinto cambia**: ogni 45-60 secondi un rombo avvisa e alcuni muri si spostano (il labirinto resta sempre risolvibile e le porte restano non aggirabili).
- **Blackout**: ogni 60-90 secondi le luci si spengono per 25 secondi. Si trovano 2 **torce** sul pavimento: chi ne porta una vede più lontano. Un oggetto a testa; si può lasciare e passare a un amico.
- **Cronometro**: nessun limite di tempo, serve solo a sapere quanto ci avete messo (per livello e in totale).

## Test automatici

```bash
node test/logic.test.js     # regole di gioco, senza rete (26 controlli)
node test/play.js           # partita vera via WebSocket: 4 bot risolvono il livello 1 (PLAY_LEVELS=5 per tutti e 5)
NODE_PATH=/opt/npm-tools/node_modules node test/e2e.js cartella   # 2 browser Chromium: lobby, movimento, voce WebRTC
NODE_PATH=/opt/npm-tools/node_modules node test/visual.js cartella # screenshot delle scene principali
```

L'audio vero (che si senta davvero dagli altoparlanti) va provato a mano: vedi sotto.

## Provare la voce con due telefoni

1. Apri il link `https://...` su entrambi, concedi il microfono, entra nella stessa stanza.
2. In alto a destra: "🎤 Mic" deve essere attivo; nella lista in basso a sinistra, accanto al nome dell'altro, deve comparire 🔈 (collegato) e 🗣️ quando parla.
3. Se vedi ⚠️ vicino a un nome, il collegamento diretto non è riuscito: succede con certe reti mobili (serve un server TURN, vedi roadmap). Prova con il Wi‑Fi.
4. Cuffie obbligatorie per evitare l'eco.

## Deploy su Render (gratis)

1. Repository GitHub con il contenuto di questa cartella (`.gitignore` esclude `node_modules`).
2. Render: **New > Blueprint** (usa `render.yaml`) oppure **New > Web Service** con Build `npm install`, Start `npm start`, piano Free. È un **Web Service**, non un sito statico.
3. Link `https://nome.onrender.com`: passalo agli amici. Il piano gratuito va a dormire dopo 15 minuti senza traffico (riparte in circa un minuto); durante la partita resta sveglio. Le stanze sono in memoria.

## Quanto ci vuole

I 4 bot del test conoscono la mappa, non hanno il mostro e non parlano: finiscono i 5 livelli in circa **3 minuti e 45** di gioco (da 30 a 70 secondi per livello). È il minimo possibile; una squadra di persone che esplora a voce ci mette molto di più.

## Limiti attuali e prossimi passi

1. Voce: solo server STUN pubblici, niente TURN. Con alcune reti mobili/aziendali il collegamento audio può non riuscire. Soluzione: aggiungere un TURN (es. servizio gratuito con credenziali) in `public/voice.js`.
2. Grafica a emoji e texture generate da codice; si può migliorare con sprite veri.
3. Suoni semplici (Web Audio), volumi bassi per non coprire le voci.
4. Idee ancora da fare: ruoli, trappole comiche (bucce di banana, trampolini), altri mostri, classifica dei tempi, riconnessione dopo caduta di rete.
