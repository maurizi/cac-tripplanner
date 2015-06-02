#!/bin/bash
#
# Download and install Boundary executable for logging.
# Based on Boundary-provided installer command.
#

set -e
set -o errexit

cd /opt
curl -fsS -d '{"token":"{{ boundary_token }}"}' -H 'Content-Type: application/json' https://meter.boundary.com/setup_meter > setup_meter.sh
chmod +x setup_meter.sh
./setup_meter.sh
