"""Trim quiet lead-in and downsample the generated mono WAV effects."""

from pathlib import Path
import wave

import numpy as np


audio = Path(__file__).resolve().parents[1] / 'dist' / 'assets' / 'audio'
files = sorted(audio.glob('*-short.wav'))
before, after = 0, 0
for file in files:
    before += file.stat().st_size
    with wave.open(str(file)) as stream:
        rate = stream.getframerate()
        assert stream.getnchannels() == 1 and stream.getsampwidth() == 2, file
        samples = np.frombuffer(stream.readframes(stream.getnframes()), dtype='<i2').astype(float)
    if rate == 16000:
        after += file.stat().st_size
        continue
    block = rate // 100
    envelopes = np.sqrt(np.mean(samples[:len(samples)//block*block].reshape(-1, block)**2, axis=1))
    onset = np.flatnonzero(envelopes >= max(16, envelopes.max() * .04))[0]
    lead = max(0, int(onset)-2) * block
    samples = samples[lead:]
    cutoff = 7200 / rate
    weights = 2 * cutoff * np.sinc(2 * cutoff * np.arange(-20, 21)) * np.hanning(41)
    filtered = np.convolve(samples, weights / weights.sum(), mode='same')
    samples = np.interp(np.arange(0, len(filtered), rate/16000), np.arange(len(filtered)), filtered)
    samples[:80] *= np.linspace(0, 1, 80)
    samples[-160:] *= np.linspace(1, 0, 160)
    with wave.open(str(file), 'wb') as stream:
        stream.setparams((1, 2, 16000, 0, 'NONE', 'not compressed'))
        stream.writeframes(np.rint(samples).clip(-32768, 32767).astype('<i2').tobytes())
    after += file.stat().st_size
    print(f'{file.stem}: -{lead/rate*1000:.0f} ms of lead-in, {len(samples)/16000:.2f} s')

print(f'{len(files)} effects: {before:,} -> {after:,} bytes')
