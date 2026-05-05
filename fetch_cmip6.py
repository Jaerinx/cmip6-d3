from __future__ import annotations

import os
import sys
from pathlib import Path

import intake
import numpy as np
import pandas as pd


CATALOG_URL = "https://storage.googleapis.com/cmip6/pangeo-cmip6.json"
OUTPUT_CSV = Path(__file__).parent / "data" / "cmip6_timeseries.csv"


def apply_windows_py314_gcsfs_workaround():
    """Suppress known gcsfs shutdown loop errors on Python 3.14/Windows."""
    try:
        from gcsfs.core import GCSFileSystem
    except Exception:
        return

    original_close_session = GCSFileSystem.close_session

    def safe_close_session(*args, **kwargs):
        call_args = args
        if call_args and isinstance(call_args[0], GCSFileSystem):
            call_args = call_args[1:]
        try:
            return original_close_session(*call_args, **kwargs)
        except RuntimeError as exc:
            msg = str(exc)
            if "running loop" in msg or "different loop" in msg:
                # Harmless interpreter-shutdown race in aiohttp/fsspec.
                return None
            raise

    GCSFileSystem.close_session = staticmethod(safe_close_session)


def pick_first_dataset():
    col = intake.open_esm_datastore(CATALOG_URL)
    query = col.search(
        experiment_id="historical",
        table_id="Amon",
        variable_id="tas",
        member_id="r1i1p1f1",
    )
    if len(query.df) == 0:
        raise RuntimeError("No datasets matched CMIP6 query.")

    # Keep only one model/run so the resulting D3 chart is simple.
    first = query.df.iloc[0]
    single = query.search(
        source_id=first["source_id"],
        institution_id=first["institution_id"],
        grid_label=first["grid_label"],
    )
    dsets = single.to_dataset_dict(
        zarr_kwargs={"consolidated": True},
        storage_options={"token": "anon"},
    )
    if not dsets:
        raise RuntimeError("Failed to open selected CMIP6 dataset from catalog.")
    key = list(dsets.keys())[0]
    return key, dsets[key]


def global_yearly_anomaly(ds):
    tas = ds["tas"] - 273.15  # K -> C

    if "lat" in tas.coords:
        # Area weighting approximation for regular lat/lon grids.
        weights = np.cos(np.deg2rad(tas["lat"]))
        weights.name = "weights"
        global_mean = tas.weighted(weights).mean(dim=[d for d in ["lat", "lon"] if d in tas.dims])
    else:
        global_mean = tas.mean(dim=[d for d in ["x", "y"] if d in tas.dims])

    yearly = global_mean.groupby("time.year").mean("time")
    baseline = yearly.sel(year=slice(1850, 1900)).mean("year")
    anomaly = yearly - baseline

    df = anomaly.to_dataframe(name="anomaly_c").reset_index()
    df = df[["year", "anomaly_c"]].dropna()
    return df


def main():
    apply_windows_py314_gcsfs_workaround()
    key, ds = pick_first_dataset()
    df = global_yearly_anomaly(ds)
    OUTPUT_CSV.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(OUTPUT_CSV, index=False)
    print(f"Dataset: {key}")
    print(f"Wrote {len(df)} rows to: {OUTPUT_CSV}")
    # Python 3.14 on Windows can emit noisy asyncio shutdown errors in gcsfs.
    if sys.platform.startswith("win") and sys.version_info >= (3, 14):
        sys.stdout.flush()
        os._exit(0)


if __name__ == "__main__":
    main()
