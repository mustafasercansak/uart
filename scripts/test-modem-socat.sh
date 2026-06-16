#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# UART SIM Card Module Simulator — socat AT test script
#
# Usage:
#   ./scripts/test-modem-socat.sh [--port 5011] [--vendor simcom|quectel]
#
# Requirements:
#   socat (apt install socat)
#
# The script connects to the simulator's TCP server via a socat PTY bridge,
# then runs the full AT command test suite for the selected vendor.
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

# ── Args ─────────────────────────────────────────────────────────────────────
PORT=5011
VENDOR=simcom
PTY_DIRECT=""
for i in "$@"; do
  case $i in
    --port)   PORT="${2}"; shift 2 ;;
    --vendor) VENDOR="${2}"; shift 2 ;;
    --pty)    PTY_DIRECT="${2}"; shift 2 ;;
  esac
done

# ── Colors ───────────────────────────────────────────────────────────────────
R='\033[31m' G='\033[32m' Y='\033[33m' B='\033[34m' M='\033[35m' N='\033[0m'

PTY=/tmp/uart_modem_pty_$$
SOCAT_PID=""
PASS=0
FAIL=0

cleanup() {
  [[ -n "$SOCAT_PID" ]] && kill "$SOCAT_PID" 2>/dev/null || true
  rm -f "$PTY"
}
trap cleanup EXIT

# ── Connect ───────────────────────────────────────────────────────────────────
if [[ -n "$PTY_DIRECT" ]]; then
  echo -e "${M}[INIT]${N} Connecting to ${VENDOR^^} simulator via COM port ${PTY_DIRECT}..."
  if ! [[ -e "$PTY_DIRECT" ]]; then
    echo -e "${R}[ERROR]${N} COM port bulunamadı: ${PTY_DIRECT}"
    exit 1
  fi
  exec 3<>"$PTY_DIRECT"
  echo -e "${G}[CONNECTED]${N} COM port: ${PTY_DIRECT}"
else
  echo -e "${M}[INIT]${N} Connecting to ${VENDOR^^} simulator on localhost:${PORT}..."
  socat "TCP:localhost:${PORT}" "PTY,raw,echo=0,link=${PTY}" &
  SOCAT_PID=$!
  sleep 0.4
  if ! [[ -e "$PTY" ]]; then
    echo -e "${R}[ERROR]${N} Could not connect. Is the UART simulator running on port ${PORT}?"
    exit 1
  fi
  exec 3<>"$PTY"
  echo -e "${G}[CONNECTED]${N} PTY bridge established at ${PTY}"
fi
echo ""

# ── Helpers ──────────────────────────────────────────────────────────────────
send_raw() {
  printf '%s' "$1" >&3
}

# send_at <cmd> <expected_pattern> [timeout_sec]
# Sends an AT command and waits for a response containing the pattern.
# Returns 0 on match, 1 on timeout, 2 on ERROR response.
send_at() {
  local cmd="$1"
  local expect="${2:-OK}"
  local timeout="${3:-4}"
  local buf=""

  echo -e "${B}[TX]${N} ${cmd}"
  printf '%s\r\n' "$cmd" >&3

  local deadline=$(( SECONDS + timeout ))
  while (( SECONDS < deadline )); do
    local line
    IFS= read -r -t 0.15 line <&3 2>/dev/null || true
    line="${line//$'\r'/}"
    if [[ -n "$line" ]]; then
      echo -e "${G}[RX]${N} ${line}"
      buf+="${line}"$'\n'
    fi
    if [[ "$buf" == *"$expect"* ]]; then
      (( PASS++ )) || true
      return 0
    fi
    if [[ "$buf" == *"ERROR"* ]]; then
      (( FAIL++ )) || true
      echo -e "${R}[FAIL]${N} Got ERROR while waiting for '${expect}'"
      return 2
    fi
  done

  (( FAIL++ )) || true
  echo -e "${R}[TIMEOUT]${N} No '${expect}' received within ${timeout}s"
  return 1
}

# send_data <raw_bytes> — send raw data without \r\n (for file/SMS body)
send_data() {
  printf '%s' "$1" >&3
  echo -e "${B}[TX]${N} [raw data: ${#1} bytes]"
}

# send_ctrlz — send Ctrl+Z (0x1A)
send_ctrlz() {
  printf '\x1a' >&3
  echo -e "${B}[TX]${N} [Ctrl+Z]"
}

# wait_for <pattern> [timeout]
wait_for() {
  local expect="$1"
  local timeout="${2:-8}"
  local deadline=$(( SECONDS + timeout ))
  while (( SECONDS < deadline )); do
    local line
    IFS= read -r -t 0.15 line <&3 2>/dev/null || true
    line="${line//$'\r'/}"
    if [[ -n "$line" ]]; then
      echo -e "${G}[RX]${N} ${line}"
      if [[ "$line" == *"$expect"* ]]; then
        (( PASS++ )) || true
        return 0
      fi
    fi
  done
  (( FAIL++ )) || true
  echo -e "${R}[TIMEOUT]${N} No '${expect}' received within ${timeout}s"
  return 1
}

section() {
  echo ""
  echo -e "${M}[TEST]${N} ── $1 ──────────────────────────────"
}

# ── SIMCom test suite ─────────────────────────────────────────────────────────
run_simcom() {
  section "Basic AT"
  send_at "AT"
  send_at "ATE0"                            # echo off for cleaner output

  section "Identification"
  send_at "ATI"          "SIMCOM"
  send_at "AT+GMM"       "SIM800L"
  send_at "AT+GMR"       "R14"
  send_at "AT+GSN"       "867012"
  send_at "AT+CIMI"      "286011"
  send_at "AT+CCID"      "+CCID:"

  section "Network & Status"
  send_at "AT+CFUN?"     "+CFUN:"
  send_at "AT+CPIN?"     "+CPIN: READY"
  send_at "AT+CREG?"     "+CREG:"
  send_at "AT+CNUM"      "+CNUM:"
  send_at "AT+CGATT=1"
  send_at "AT+CGATT?"    "+CGATT: 1"
  send_at "AT+CPMS?"     "+CPMS: \"SM\""
  send_at "AT+CPMS=\"SM\",\"SM\",\"SM\"" "+CPMS:"
  send_at "AT+CSQ"       "+CSQ:"
  send_at "AT+COPS?"     "+COPS:"
  send_at "AT+CBC"       "+CBC:"
  send_at "AT+CCLK?"     "+CCLK:"

  section "PDP Context"
  send_at "AT+CGDCONT=1,\"IP\",\"internet\""
  send_at "AT+CGACT=1,1"
  send_at "AT+CGACT?"    "+CGACT:"
  send_at "AT+CGPADDR=1" "+CGPADDR:"
  send_at "AT+CIFSR"     "10."

  section "SMS Inbox"
  send_at "AT+CMGF=1"
  send_at "AT+CMGL=\"ALL\""  "+CMGL:"
  send_at "AT+CMGR=1"        "+CMGR:"
  send_at "AT+CMGL=\"REC READ\""  "OK"
  send_at "AT+CMGD=2"
  send_at "AT+CMGL=\"ALL\""  "OK"

  section "SMS Receive (CNMI)"
  send_at "AT+CNMI=2,2"
  echo -e "${Y}[INFO]${N} Waiting 4s for simulated incoming SMS URC..."
  wait_for "+CMT:" 6

  section "SMS Send"
  send_at "AT+CMGS=\"+905553332211\""  ">"
  send_data "Hello from UART Simulator!"
  send_ctrlz
  wait_for "+CMGS:"

  section "GPS (SIM7600 / CGNSPWR)"
  send_at "AT+CGNSPWR=1"
  send_at "AT+CGNSPWR?"   "+CGNSPWR: 1"
  echo -e "${Y}[INFO]${N} Waiting 3s for GPS fix simulation..."
  sleep 3
  send_at "AT+CGNSINF"    "+CGNSINF:"
  send_at "AT+CGNSURC=1"

  section "Filesystem"
  send_at "AT+FSCREATE=\"client.pem\""
  send_at "AT+FSWRITE=\"client.pem\",0,30,5"  ">"
  send_data "-----BEGIN CERTIFICATE-----xyz"
  wait_for "OK"
  send_at "AT+FSCREATE=\"client.key\""
  send_at "AT+FSWRITE=\"client.key\",0,30,5"  ">"
  send_data "-----BEGIN PRIVATE KEY-----abc"
  wait_for "OK"
  send_at "AT+FSLS"      "+FSLS:"
  send_at "AT+FSFLSIZE=\"client.pem\""  "+FSFLSIZE:"
  send_at "AT+FSREAD=\"client.pem\",0,30,0"   "+FSREAD:"

  section "SSL Config"
  send_at "AT+CSSLCFG=\"sslversion\",1,3"
  send_at "AT+CSSLCFG=\"authmode\",1,3"
  send_at "AT+CSSLCFG=\"clientcert\",1,\"client.pem\""
  send_at "AT+CSSLCFG=\"clientkey\",1,\"client.key\""

  section "MQTTS"
  send_at "AT+MQTTCONN=\"broker.hivemq.com\",8883,1"
  send_at "AT+MQTTSUB=\"telemetry/temperature\""
  send_at "AT+MQTTPUB=\"telemetry/temperature\",\"temp=24.5C\""

  section "HTTP GET"
  send_at "AT+HTTPINIT"
  send_at "AT+HTTPPARA=\"URL\",\"https://jsonplaceholder.typicode.com/todos/1\""
  printf 'AT+HTTPACTION=0\r\n' >&3
  echo -e "${B}[TX]${N} AT+HTTPACTION=0"
  wait_for "+HTTPACTION:" 15
  send_at "AT+HTTPREAD"   "+HTTPREAD:"

  section "HTTP POST"
  send_at "AT+HTTPPARA=\"URL\",\"https://jsonplaceholder.typicode.com/posts\""
  send_at "AT+HTTPPARA=\"CONTENT\",\"application/json\""
  send_at "AT+HTTPDATA=39,5"  "DOWNLOAD"
  send_data '{"title":"foo","body":"bar","userId":1}'
  wait_for "OK"
  printf 'AT+HTTPACTION=1\r\n' >&3
  echo -e "${B}[TX]${N} AT+HTTPACTION=1"
  wait_for "+HTTPACTION:" 15
  send_at "AT+HTTPREAD"   "+HTTPREAD:"
  send_at "AT+HTTPTERM"

  section "Clock Set"
  send_at "AT+CCLK=\"26/06/15,14:30:00+12\""
  send_at "AT+CCLK?"     "+CCLK:"

  section "Cleanup"
  send_at "AT+FSDEL=\"client.pem\""
  send_at "AT+FSDEL=\"client.key\""
  send_at "AT+FSLS"      "+FSLS:"
  send_at "AT+CGNSPWR=0"
}

# ── Quectel test suite ────────────────────────────────────────────────────────
run_quectel() {
  section "Basic AT"
  send_at "AT"
  send_at "ATE0"

  section "Identification"
  send_at "ATI"          "Quectel"
  send_at "AT+GMM"       "EC21"
  send_at "AT+GMR"       "EC21"
  send_at "AT+GSN"       "867012"
  send_at "AT+CIMI"      "286011"
  send_at "AT+CCID"      "+CCID:"

  section "Network & Status"
  send_at "AT+CFUN?"     "+CFUN:"
  send_at "AT+CPIN?"     "+CPIN: READY"
  send_at "AT+CREG?"     "+CREG:"
  send_at "AT+CEREG?"    "+CEREG:"
  send_at "AT+CNUM"      "+CNUM:"
  send_at "AT+CGATT=1"
  send_at "AT+CGATT?"    "+CGATT: 1"
  send_at "AT+CPMS?"     "+CPMS: \"SM\""
  send_at "AT+CPMS=\"SM\",\"SM\",\"SM\"" "+CPMS:"
  send_at "AT+CSQ"       "+CSQ:"
  send_at "AT+COPS?"     "+COPS:"
  send_at "AT+CBC"       "+CBC:"
  send_at "AT+CCLK?"     "+CCLK:"

  section "PDP Context"
  send_at "AT+CGDCONT=1,\"IP\",\"internet\""
  send_at "AT+CGACT=1,1"
  send_at "AT+CGACT?"    "+CGACT:"
  send_at "AT+CGPADDR=1" "+CGPADDR:"
  send_at "AT+CIFSR"     "10."

  section "SMS Inbox"
  send_at "AT+CMGF=1"
  send_at "AT+CMGL=\"ALL\""  "+CMGL:"
  send_at "AT+CMGR=1"        "+CMGR:"
  send_at "AT+CMGD=2"
  send_at "AT+CMGL=\"ALL\""  "OK"

  section "SMS Receive (CNMI)"
  send_at "AT+CNMI=2,2"
  echo -e "${Y}[INFO]${N} Waiting 4s for simulated incoming SMS URC..."
  wait_for "+CMT:" 6

  section "GPS (BG96 / QGPS)"
  send_at "AT+QGPS=1"
  send_at "AT+QGPS?"     "+QGPS: 1"
  echo -e "${Y}[INFO]${N} Waiting 3s for GPS fix simulation..."
  sleep 3
  send_at "AT+QGPSLOC=2"    "+QGPSLOC:"
  send_at "AT+QGPSLOC"      "+QGPSLOC:"
  send_at "AT+QGPSGNMEA=\"GGA\""  "+QGPSGNMEA:"
  send_at "AT+QGPSGNMEA=\"RMC\""  "+QGPSGNMEA:"
  send_at "AT+QGPSGNMEA=\"GSV\""  "+QGPSGNMEA:"

  section "Filesystem (QFOPEN/QFWRITE)"
  send_at "AT+QFOPEN=\"client.pem\",2"  "+QFOPEN:"
  send_at "AT+QFWRITE=1,30"  "CONNECT"
  send_data "-----BEGIN CERTIFICATE-----xyz"
  wait_for "+QFWRITE:"
  send_at "AT+QFCLOSE=1"

  send_at "AT+QFOPEN=\"client.key\",2"  "+QFOPEN:"
  send_at "AT+QFWRITE=2,30"  "CONNECT"
  send_data "-----BEGIN PRIVATE KEY-----abc"
  wait_for "+QFWRITE:"
  send_at "AT+QFCLOSE=2"

  send_at "AT+QFLST"     "OK"
  send_at "AT+QFOPEN=\"client.pem\",0"  "+QFOPEN:"
  send_at "AT+QFREAD=3,30"  "+QFREAD:"
  send_at "AT+QFCLOSE=3"

  section "SSL Config"
  send_at "AT+QSSLCFG=\"sslversion\",1,3"
  send_at "AT+QSSLCFG=\"seclevel\",1,2"
  send_at "AT+QSSLCFG=\"clientcert\",1,\"client.pem\""
  send_at "AT+QSSLCFG=\"clientkey\",1,\"client.key\""

  section "MQTTS (QMTOPEN/QMTCONN)"
  printf 'AT+QMTOPEN=0,"broker.hivemq.com",8883\r\n' >&3
  echo -e "${B}[TX]${N} AT+QMTOPEN=0,\"broker.hivemq.com\",8883"
  wait_for "+QMTOPEN:" 5
  printf 'AT+QMTCONN=0,"uart-sim-client"\r\n' >&3
  echo -e "${B}[TX]${N} AT+QMTCONN=0,\"uart-sim-client\""
  wait_for "+QMTCONN:" 5
  printf 'AT+QMTSUB=0,1,"telemetry/temperature",1\r\n' >&3
  echo -e "${B}[TX]${N} AT+QMTSUB=0,1,\"telemetry/temperature\",1"
  wait_for "+QMTSUB:" 5
  printf 'AT+QMTPUB=0,1,0,0,"telemetry/temperature"\r\n' >&3
  echo -e "${B}[TX]${N} AT+QMTPUB=0,1,0,0,\"telemetry/temperature\""
  wait_for ">" 3
  send_data "temp=24.5C"
  send_ctrlz
  wait_for "+QMTPUB:"
  send_at "AT+QMTCLOSE=0"

  section "HTTP GET (QHTTPURL + QHTTPGET)"
  local url="https://jsonplaceholder.typicode.com/todos/1"
  printf "AT+QHTTPURL=%d,30\r\n" "${#url}" >&3
  echo -e "${B}[TX]${N} AT+QHTTPURL=${#url},30"
  wait_for "CONNECT" 4
  send_data "$url"
  wait_for "OK" 4
  printf 'AT+QHTTPGET=30\r\n' >&3
  echo -e "${B}[TX]${N} AT+QHTTPGET=30"
  wait_for "+QHTTPGET:" 15
  send_at "AT+QHTTPREAD=10"   "+QHTTPREAD:"

  section "HTTP POST (QHTTPPOST)"
  local post_url="https://jsonplaceholder.typicode.com/posts"
  local post_body='{"title":"foo","body":"bar","userId":1}'
  printf "AT+QHTTPURL=%d,30\r\n" "${#post_url}" >&3
  echo -e "${B}[TX]${N} AT+QHTTPURL=${#post_url},30"
  wait_for "CONNECT" 4
  send_data "$post_url"
  wait_for "OK" 4
  printf "AT+QHTTPPOST=%d,10,30\r\n" "${#post_body}" >&3
  echo -e "${B}[TX]${N} AT+QHTTPPOST=${#post_body},10,30"
  wait_for "CONNECT" 4
  send_data "$post_body"
  wait_for "+QHTTPPOST:" 15
  send_at "AT+QHTTPREAD=10"   "+QHTTPREAD:"

  section "Clock Set"
  send_at "AT+CCLK=\"26/06/15,14:30:00+12\""
  send_at "AT+CCLK?"     "+CCLK:"

  section "Cleanup"
  send_at "AT+QFDEL=\"client.pem\""
  send_at "AT+QFDEL=\"client.key\""
  send_at "AT+QFLST"     "OK"
  send_at "AT+QGPSEND"
}

# ── Run ───────────────────────────────────────────────────────────────────────
if [[ "$VENDOR" == "quectel" ]]; then
  run_quectel
else
  run_simcom
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo -e "─────────────────────────────────────────────"
echo -e "${G}PASS: ${PASS}${N}  ${R}FAIL: ${FAIL}${N}"
if (( FAIL == 0 )); then
  echo -e "${G}All tests passed.${N}"
  exit 0
else
  echo -e "${R}${FAIL} test(s) failed.${N}"
  exit 1
fi
