# CMIP6 + D3 quick visualization

This folder contains a minimal D3 line chart for CMIP6 yearly temperature anomaly.

## Files

- `index.html`: page shell and D3 include
- `app.js`: data loading + chart rendering
- `styles.css`: basic styling
- `data/cmip6_sample.csv`: fallback sample data
- `data/cmip6_timeseries.csv`: your CMIP6 export (create this file)

## Expected CSV format

```csv
year,anomaly_c
2000,0.42
2001,0.44
```

## Run locally

From the `cmip6-d3` folder:

```powershell
python fetch_cmip6.py
python -m http.server 8000
```

Then open [http://localhost:8000](http://localhost:8000).

`fetch_cmip6.py` pulls a real CMIP6 historical `tas` dataset from the public Pangeo CMIP6 catalog and writes `data/cmip6_timeseries.csv`.
