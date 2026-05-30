# NeuroPeer — TRIBE v2 Inference Image
# For local testing / model weight pre-download (DataCrunch uses startup scripts)
#
# Build:  docker build -t neuropeer/tribe-inference:latest .
# Push:   docker push neuropeer/tribe-inference:latest
#
# This image pre-downloads the TRIBE v2 model weights so boot time
# is dominated by instance start (~30s) rather than HuggingFace download.

FROM nvidia/cuda:12.4.1-cudnn-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3.11 python3-pip python3.11-dev \
    git curl \
    && rm -rf /var/lib/apt/lists/*

RUN ln -sf /usr/bin/python3.11 /usr/bin/python && ln -sf /usr/bin/pip3 /usr/bin/pip

# Install ML dependencies (pinned for reproducibility)
RUN pip install --no-cache-dir \
    torch==2.4.0+cu124 \
    torchvision==0.19.0+cu124 \
    --index-url https://download.pytorch.org/whl/cu124

RUN pip install --no-cache-dir \
    transformers==4.44.2 \
    huggingface-hub==0.24.6 \
    numpy==1.26.4 \
    pandas==2.2.2 \
    pyarrow==17.0.0 \
    boto3==1.35.20 \
    scipy==1.14.1 \
    nilearn==0.10.4

WORKDIR /inference

# Pre-download TRIBE v2 weights at build time
# (Pass HF_TOKEN as a build arg if the model is gated)
ARG HF_TOKEN=""
ARG TRIBE_MODEL_ID="facebook/tribev2"
RUN python -c "
from huggingface_hub import snapshot_download
import os
snapshot_download(
    repo_id=os.environ.get('TRIBE_MODEL_ID', '${TRIBE_MODEL_ID}'),
    token='${HF_TOKEN}' or None,
    local_dir='/models/tribev2',
    ignore_patterns=['*.msgpack', '*.h5'],
)
print('TRIBE v2 weights pre-downloaded successfully.')
"

ENV TRIBE_MODEL_PATH=/models/tribev2

# On DataCrunch, deps are installed via bash startup_script at instance boot.
# This CMD is a fallback for manual testing.
CMD ["python", "-c", "print('NeuroPeer TRIBE v2 inference image ready.')"]
