# Treninfo Backend (Netlify)

Questo backend espone alcune API “proxy” verso:

- ViaggiaTreno (RFI) (`http://www.viaggiatreno.it/...`)
- LeFrecce / Trenitalia (`https://www.lefrecce.it/...`)

## Deploy su Netlify

Se usi `Treninfo/old` come “base directory” su Netlify:

- Functions: `netlify/functions`
- Redirect `/api/*` → `/.netlify/functions/api/:splat` (configurato in `netlify.toml`)

## Esecuzione locale

- `npm install`
- `npm run dev`
- Server: `http://localhost:3000`

## Endpoints

### Autocomplete stazioni (ViaggiaTreno)

- `GET /api/viaggiatreno/autocomplete?query=FIREN`
- Risposta: `{ ok: boolean, data: Array<{ nome, codice, name, code }> }`

### Autocomplete stazioni (LeFrecce)

- `GET /api/lefrecce/autocomplete?query=FIREN`
- Risposta: `{ ok: boolean, data: Array<{ name: string, id: number|string }> }`

### Soluzioni di viaggio (LeFrecce)

- `GET /api/solutions?fromName=...&toName=...&date=YYYY-MM-DD&time=HH:mm&...`
- Risposta: `{ ok: boolean, solutions: Array, minimumPrices?: any }`

### Info stazione (ViaggiaTreno)

- `GET /api/stations/info?stationCode=S06904`

### Partenze/Arrivi stazione (ViaggiaTreno)

- `GET /api/stations/departures?stationCode=S06904&when=now`
- `GET /api/stations/arrivals?stationCode=S06904&when=now`

### Stato treno (ViaggiaTreno)

- `GET /api/trains/status?trainNumber=666`

### News (ViaggiaTreno)

- `GET /api/news`

