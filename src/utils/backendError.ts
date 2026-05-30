type TranslateFn = (path: string, params?: Record<string, unknown>) => string;

export function translateBackendError(t: TranslateFn, error: string): string {
  const colonIdx = error.indexOf(':');
  const code = colonIdx >= 0 ? error.slice(0, colonIdx) : error;
  const param = colonIdx >= 0 ? error.slice(colonIdx + 1) : undefined;

  switch (code) {
    case 'ERR_PORT_LOCKED':
      return t('errors.portLocked');
    case 'ERR_SERIAL_NOT_CONNECTED':
      return t('errors.serialNotConnected');
    case 'ERR_TCP_NOT_CONNECTED':
      return t('errors.tcpNotConnected');
    case 'ERR_NO_CONNECTED_CLIENT':
      return t('errors.noConnectedClient');
    case 'ERR_INVALID_SOCKETCAN_INTERFACE':
      return t('errors.invalidSocketCANInterface');
    case 'ERR_SOCKETCAN_INTERFACE_NOT_FOUND':
      return t('errors.socketCANInterfaceNotFound', { interface: param });
    case 'ERR_SOCKETCAN_LINUX_ONLY':
      return t('errors.socketCANLinuxOnly');
    case 'ERR_SOCKETCAN_NOT_CONNECTED':
      return t('errors.socketCANNotConnected');
    case 'ERR_RECORDING_NOT_FOUND':
      return t('errors.recordingNotFound', { id: param });
    default:
      return error;
  }
}
