# Multi-platform image index, checked 2026-09-08. Update deliberately and revalidate.
FROM python:3.13-alpine@sha256:7415fbc3c9e4979cc717d92377ab2bc7b2b4a2af1ac03cc52b5f3f88efedaf3a

RUN addgroup -g 1000 explorer \
    && adduser -D -u 1000 -G explorer explorer \
    && mkdir /workspace \
    && chown explorer:explorer /workspace
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
USER explorer
WORKDIR /workspace
CMD ["python", "--version"]
