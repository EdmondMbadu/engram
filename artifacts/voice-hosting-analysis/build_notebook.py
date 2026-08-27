from pathlib import Path

import nbformat as nbf
from nbclient import NotebookClient


OUT = Path(__file__).with_name("voice_hosting_cost_analysis.ipynb")

nb = nbf.v4.new_notebook()
nb["metadata"]["kernelspec"] = {
    "display_name": "Python 3",
    "language": "python",
    "name": "python3",
}

nb["cells"] = [
    nbf.v4.new_markdown_cell(
        """# LivingWiki voice hosting: cost and break-even analysis

## TL;DR

LivingWiki should **not replace ElevenLabs wholesale today**. The last 30 days of cached speech amount to about 340 audio minutes and an estimated **$33.72 of list-price TTS usage**. An always-on L4 GPU would cost roughly **$285–$516/month before high availability and engineering**, so it is uneconomic at the observed volume. A scale-to-zero pilot can be cheap in raw GPU time, but quality, cold starts, reliability, licensing, and operating effort become the real decision factors.

The pragmatic route is to keep ElevenLabs for real-time conversational sessions and test an open model only for asynchronous cached narration and instant personal clones, behind a feature flag and ElevenLabs fallback.
"""
    ),
    nbf.v4.new_markdown_cell(
        """## Context and methods

Observed data came from LivingWiki's Firebase Storage inventory for the 30 days ending 2026-08-26. Audio duration is inferred from stored MP3 size at the application's requested 128 kbps output rate; this is an estimate, not a decoded-duration measurement. Model assignments come from the current LivingWiki source code: `eleven_multilingual_v2` for tour/stack-video speech and `eleven_flash_v2_5` for the remaining speech categories.

List prices and infrastructure assumptions are explicit parameters below. This notebook separates:

- **Observed:** stored object counts and bytes.
- **Calculated:** inferred minutes, list-price TTS cost, and compute-only break-even.
- **Modeled:** open-model real-time factor (RTF) and scale-to-zero operating allowance.

Sources: [ElevenLabs API pricing](https://elevenlabs.io/pricing/api), [ElevenLabs Agents pricing](https://elevenlabs.io/pricing/agents), [RunPod Serverless pricing](https://docs.runpod.io/serverless/pricing), [RunPod GPU pricing guide](https://www.runpod.io/articles/guides/ai-server-cost), [Google Cloud accelerator-optimized pricing](https://cloud.google.com/products/compute/pricing/accelerator-optimized), [VoiceStudio](https://github.com/debpalash/VoiceStudio), and [OmniVoice](https://github.com/k2-fsa/OmniVoice).
"""
    ),
    nbf.v4.new_code_cell(
        """from math import ceil

# Observed 30-day storage inventory (2026-07-27 through 2026-08-26)
observed = {
    "tour": {"objects": 968, "bytes": 255_564_134, "model": "multilingual_v2"},
    "stack_video": {"objects": 220, "bytes": 65_473_495, "model": "multilingual_v2"},
    "stack_trailer": {"objects": 6, "bytes": 2_149_832, "model": "flash_v2_5"},
    "recap": {"objects": 15, "bytes": 3_149_991, "model": "flash_v2_5"},
    "full": {"objects": 1, "bytes": 24_286, "model": "flash_v2_5"},
}

# Explicit cost and performance assumptions
MP3_BITS_PER_SECOND = 128_000
ELEVEN_MULTILINGUAL_USD_PER_AUDIO_MIN = 0.10
ELEVEN_FLASH_USD_PER_AUDIO_MIN = 0.05
ELEVEN_AGENTS_USD_PER_MIN = 0.08
RUNPOD_L4_DEDICATED_USD_PER_GPU_HOUR = 0.39
RUNPOD_L4_SERVERLESS_FLEX_USD_PER_SECOND = 0.00019
RUNPOD_L4_SERVERLESS_ACTIVE_USD_PER_SECOND = 0.00013
GCP_G2_STANDARD_4_USD_PER_HOUR = 0.706832276
HOURS_PER_MONTH = 730
OPEN_MODEL_RTF_RANGE = (0.10, 0.70)  # planning range, not a VoiceStudio-verified benchmark
SCALE_TO_ZERO_PILOT_ALLOWANCE_USD = (5, 25)  # compute + cold/idle/storage allowance
"""
    ),
    nbf.v4.new_markdown_cell("## Data and calculations"),
    nbf.v4.new_code_cell(
        """def inferred_audio_minutes(byte_count, bitrate=MP3_BITS_PER_SECOND):
    return byte_count * 8 / bitrate / 60

rows = []
for category, item in observed.items():
    minutes = inferred_audio_minutes(item["bytes"])
    unit_price = (
        ELEVEN_MULTILINGUAL_USD_PER_AUDIO_MIN
        if item["model"] == "multilingual_v2"
        else ELEVEN_FLASH_USD_PER_AUDIO_MIN
    )
    rows.append({
        "category": category,
        "objects": item["objects"],
        "stored_mb": item["bytes"] / 1_000_000,
        "inferred_audio_minutes": minutes,
        "model": item["model"],
        "estimated_list_tts_usd": minutes * unit_price,
    })

total_objects = sum(row["objects"] for row in rows)
total_minutes = sum(row["inferred_audio_minutes"] for row in rows)
total_tts_cost = sum(row["estimated_list_tts_usd"] for row in rows)

for row in rows:
    print(
        f'{row["category"]:14} {row["objects"]:4d} objects  '
        f'{row["inferred_audio_minutes"]:7.2f} min  '
        f'${row["estimated_list_tts_usd"]:6.2f}'
    )
print(f"TOTAL          {total_objects:4d} objects  {total_minutes:7.2f} min  ${total_tts_cost:6.2f}")
"""
    ),
    nbf.v4.new_code_cell(
        """always_on = {
    "RunPod dedicated L4": RUNPOD_L4_DEDICATED_USD_PER_GPU_HOUR * HOURS_PER_MONTH,
    "RunPod active serverless L4": RUNPOD_L4_SERVERLESS_ACTIVE_USD_PER_SECOND * 3600 * HOURS_PER_MONTH,
    "GCP g2-standard-4 (L4)": GCP_G2_STANDARD_4_USD_PER_HOUR * HOURS_PER_MONTH,
}

rtf_compute = {
    f"RTF {rtf:.2f}": total_minutes * 60 * rtf * RUNPOD_L4_SERVERLESS_FLEX_USD_PER_SECOND
    for rtf in OPEN_MODEL_RTF_RANGE
}

print("Always-on compute-only monthly cost:")
for label, cost in always_on.items():
    print(f"  {label:31} ${cost:7.2f}")

print("\\nScale-to-zero raw GPU cost at observed volume:")
for label, cost in rtf_compute.items():
    print(f"  {label:31} ${cost:7.2f}")
print(f"  Planning allowance             ${SCALE_TO_ZERO_PILOT_ALLOWANCE_USD[0]}–${SCALE_TO_ZERO_PILOT_ALLOWANCE_USD[1]}/month")
"""
    ),
    nbf.v4.new_code_cell(
        """break_even_rows = []
for host, monthly_cost in always_on.items():
    break_even_rows.append({
        "host": host,
        "vs_multilingual_minutes": monthly_cost / ELEVEN_MULTILINGUAL_USD_PER_AUDIO_MIN,
        "vs_flash_minutes": monthly_cost / ELEVEN_FLASH_USD_PER_AUDIO_MIN,
        "vs_agents_minutes_compute_only": monthly_cost / ELEVEN_AGENTS_USD_PER_MIN,
    })

print("Compute-only monthly break-even audio minutes:")
for row in break_even_rows:
    print(
        f'{row["host"]:31} '
        f'{row["vs_multilingual_minutes"]:7.0f} Multilingual | '
        f'{row["vs_flash_minutes"]:7.0f} Flash | '
        f'{row["vs_agents_minutes_compute_only"]:7.0f} Agents*'
    )
print("*Agents comparison excludes STT, orchestration, LLM, concurrency headroom, and HA.")
"""
    ),
    nbf.v4.new_markdown_cell(
        """## Results

1. **Observed batch TTS is not large enough to justify an always-on GPU.** The current estimate is about 340 new audio minutes and $33.72 of list-price TTS usage for 30 days. LivingWiki's cache means repeated playback does not consume new ElevenLabs TTS credits.
2. **Scale-to-zero can make raw GPU cost tiny, but raw compute is not total cost.** At the planning RTF range, observed production would consume under $3 of flex GPU time. A practical pilot allowance is $5–$25/month before engineering, monitoring, incident response, and quality-review labor.
3. **A reliable always-on service moves in the wrong direction at today's volume.** A single L4 is roughly $285–$516/month compute-only. High availability can roughly double that before storage, egress, logs, and support.
4. **The real-time stack is a separate decision.** LivingWiki uses ElevenLabs not only for synthesis but also for real-time voice sessions. Replacing that requires STT, endpointing, conversational orchestration, streaming, concurrency control, and fallback—not merely a TTS endpoint.
5. **The cost conclusion is incomplete without the ElevenLabs invoice.** This estimate reconstructs marginal TTS from stored outputs. It does not include the base subscription, unpersisted previews, deleted audio, failed generations, or billed conversational minutes.
"""
    ),
    nbf.v4.new_markdown_cell(
        """## Takeaways and decision gate

Run a two-week, feature-flagged pilot for asynchronous narration and instant personal clones only. Use 10–20 consenting voices and 20–30 representative scripts across English and LivingWiki's priority languages. Blind-rate speaker identity, naturalness, pronunciation, emotion, long-form stability, and finished-video quality; measure p50/p95 time-to-first-audio, RTF, VRAM, cold starts, failures, retries, and concurrency.

Move batch TTS only if the open stack is within roughly 5–10% of ElevenLabs in blind preference, has <1% operational failure rate, meets the product's p95 latency target, and projected annual savings exceed the added engineering/operations burden. Keep an ElevenLabs fallback.

For production, prefer evaluating the Apache-2.0 OmniVoice model behind a minimal service rather than making the AGPL-3.0 VoiceStudio beta wrapper a core dependency. VoiceStudio is valuable as an evaluation UI, but its own benchmark table currently contains no verified result rows. Obtain legal review before offering a modified AGPL service over a network.
"""
    ),
]

nbf.write(nb, OUT)
client = NotebookClient(nb, timeout=120, kernel_name="python3")
executed = client.execute(cwd=str(OUT.parent))
nbf.write(executed, OUT)
print(OUT)
