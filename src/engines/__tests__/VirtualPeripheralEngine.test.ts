import { describe, it, expect, beforeEach, vi } from 'vitest';
import { VirtualPeripheralEngine, LM75Driver, EEPROMDriver, ScriptableDriver, SimCardDriver } from '../VirtualPeripheralEngine';

describe('VirtualPeripheralEngine', () => {
  let engine: VirtualPeripheralEngine;

  beforeEach(() => {
    engine = new VirtualPeripheralEngine();
  });

  describe('VentilatorDriver', () => {
    it('should set respiratory rate (RR) when receiving 0x20 command', () => {
      const input = [0x20, 25];
      const responses = engine.processIncoming('UART', input);
      expect(responses).toHaveLength(1);
      expect(responses[0].bytes).toEqual([0x06]);
      expect(responses[0].log).toContain('25 BPM');
    });

    it('should respond to self-test command 0x25', () => {
      const input = [0x25];
      const responses = engine.processIncoming('UART', input);
      expect(responses).toHaveLength(1);
      expect(responses[0].bytes).toEqual([0x06]);
      expect(responses[0].log).toContain('Tamam');
    });
  });

  describe('InfusionPumpDriver', () => {
    it('should respond to bolus command 0x10', () => {
      const input = [0x10];
      const responses = engine.processIncoming('UART', input);
      expect(responses[0].log).toContain('Bolus');
    });

    it('should START and STOP', () => {
      expect(engine.processIncoming('UART', [0x01])[0].log).toContain('Started');
      expect(engine.processIncoming('UART', [0x02])[0].log).toContain('Stopped');
    });

    it('should SET FLOW', () => {
      const input = [0x03, 0x01, 0x2C]; // 0x012C = 300
      const res = engine.processIncoming('UART', input);
      expect(res[0].log).toContain('Set Flow Rate to 300');
    });

    it('should respond to air alarm 0x07', () => {
      expect(engine.processIncoming('UART', [0x07])[0].log).toContain('AIR ALARM');
    });
  });

  describe('LM75Driver (I2C)', () => {
    it('should ignore mismatching address', () => {
      const input = [0x49 << 1]; // Wrong address 0x49
      const responses = engine.processIncoming('I2C', input);
      expect(responses).toHaveLength(0);
    });

    it('should return temperature data on read (0x48)', () => {
      const input = [(0x48 << 1) | 1]; // Address 0x48 with Read bit
      const responses = engine.processIncoming('I2C', input);
      expect(responses).toHaveLength(1);
      expect(responses[0].bytes).toHaveLength(2);
      expect(responses[0].log).toContain('LM75 Temp Read');
    });

    it('should update config on write', () => {
      const input = [(0x48 << 1), 0x01, 0x1F]; // Address 0x48, Reg 0x01, Val 0x1F
      const responses = engine.processIncoming('I2C', input);
      expect(responses).toHaveLength(1);
      expect(responses[0].log).toContain('LM75 Config Write -> 0x1f');
    });
  });

  describe('EEPROMDriver (SPI)', () => {
    it('should handle WREN/WRDI and status register', () => {
      // WREN
      let res = engine.processIncoming('SPI', [0x06]);
      expect(res[0].log).toContain('WREN');

      // RDSR - should show WREN (0x02)
      res = engine.processIncoming('SPI', [0x05]);
      expect(res[0].bytes).toEqual([0x02]);

      // WRDI
      res = engine.processIncoming('SPI', [0x04]);
      expect(res[0].log).toContain('WRDI');

      // RDSR - should show 0x00
      res = engine.processIncoming('SPI', [0x05]);
      expect(res[0].bytes).toEqual([0x00]);
    });

    it('should fail write without WREN', () => {
      const input = [0x02, 0x10, 0xAA]; // Write 0xAA to 0x10
      const res = engine.processIncoming('SPI', input);
      expect(res[0].log).toContain('FAILED');
    });

    it('should write and read memory', () => {
      engine.processIncoming('SPI', [0x06]); // WREN
      engine.processIncoming('SPI', [0x02, 0x20, 0x55]); // Write 0x55 to 0x20

      const res = engine.processIncoming('SPI', [0x03, 0x20]); // Read 0x20
      expect(res[0].bytes).toEqual([0x55]);
      expect(res[0].log).toContain('Read @0x20 -> 0x55');
    });

    it('should ignore unknown command', () => {
      expect(engine.processIncoming('SPI', [0xFF])).toHaveLength(0);
    });
  });

  describe('VirtualConsoleDriver (UART)', () => {
    it('should respond to HELP', () => {
      const input = Array.from('HELP').map(c => c.charCodeAt(0));
      const res = engine.processIncoming('UART', input);
      expect(res[0].log).toContain('HELP');
      expect(res[0].bytes.length).toBeGreaterThan(0);
    });

    it('should respond to STATUS', () => {
      const input = Array.from('STATUS').map(c => c.charCodeAt(0));
      const res = engine.processIncoming('UART', input);
      expect(res[0].log).toContain('STATUS');
    });

    it('should ignore unknown text', () => {
      const input = Array.from('FOO').map(c => c.charCodeAt(0));
      expect(engine.processIncoming('UART', input)).toHaveLength(0);
    });
  });

  describe('ClampDriver', () => {
    it('should SET POSITION and CALIBRATE', () => {
      vi.useFakeTimers();
      const res = engine.processIncoming('UART', [0x10, 50]);
      // Multiple peripherals might respond to 0x10, find the clamp one
      const clampRes = res.find(r => r.log.includes('position to 50%'));
      expect(clampRes).toBeDefined();

      // Advance timers to hit the setTimeout callback (line 211-212)
      vi.advanceTimersByTime(500);

      const calRes = engine.processIncoming('UART', [0x11]);
      const clampCal = calRes.find(r => r.log.includes('Calibrating'));
      expect(clampCal).toBeDefined();
      vi.useRealTimers();
    });
  });

  describe('ScriptableDriver', () => {
    it('should execute scripts and maintain state', () => {
      const script = 'state.val = (state.val || 0) + input[0]; send(state.val);';
      const driver = new ScriptableDriver('custom', 'Custom Driver', 'UART', script, { val: 10 });
      
      const res = driver.process([5]);
      expect(res!.bytes).toEqual([15]);
      expect(driver.getState()).toEqual({ val: 15 });
    });

    it('should allow updating the script', () => {
      const driver = new ScriptableDriver('custom', 'Custom Driver', 'UART', 'send(1);', {});
      expect(driver.process([])!.bytes).toEqual([1]);
      
      driver.updateScript('send(2);');
      expect(driver.process([])!.bytes).toEqual([2]);
    });
  });

  describe('Engine Management', () => {
    it('should add and remove drivers', () => {
      const driver = new LM75Driver();
      driver.id = 'temp-test';
      
      // First, remove existing one if we want exactly one response, 
      // or just check that we can add and then remove.
      engine.removeDriver('lm75'); 
      
      engine.addDriver(driver);
      expect(engine.processIncoming('I2C', [(0x48 << 1) | 1])).toHaveLength(1);
      
      // Adding same ID should replace (filtering logic)
      engine.addDriver(driver);
      expect(engine.processIncoming('I2C', [(0x48 << 1) | 1])).toHaveLength(1);
      
      engine.removeDriver('temp-test');
      expect(engine.processIncoming('I2C', [(0x48 << 1) | 1])).toHaveLength(0);
    });

    it('should clear scriptable drivers', () => {
      const scriptable = new ScriptableDriver('s1', 'S1', 'UART', 'send(1)', {});
      engine.addDriver(scriptable);
      
      expect(engine.processIncoming('UART', [0x00]).length).toBeGreaterThan(0);
      
      engine.clearScriptableDrivers();
      // Only built-in drivers should remain. Built-ins might still respond to 0x00 if they don't check length correctly,
      // but ScriptableDriver definitely won't be there.
      const res = engine.processIncoming('UART', [0x00]);
      expect(res.find(r => r.bytes.includes(1))).toBeUndefined();
    });
  });

  describe('Engine edge cases', () => {
    it('should handle empty input', () => {
      expect(engine.processIncoming('UART', [])).toHaveLength(0);
    });

    it('should hit driver edge cases', () => {
      const lm75 = new LM75Driver();
      expect(lm75.getState()).toBeDefined();
      expect(lm75.process([])).toBeNull();
      expect(lm75.process([0x48 << 1])).toBeNull();
      expect(lm75.process([(0x48 << 1), 0x01])).toBeNull();

      const eeprom = new EEPROMDriver();
      expect(eeprom.process([])).toBeNull();
      expect(eeprom.process([0x03])).toBeNull();
    });
  });
  describe('SimCardDriver', () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it('should respond to AT with OK', () => {
      const input = Array.from('AT\r\n').map(c => c.charCodeAt(0));
      const res = engine.processIncoming('UART', input);
      const simRes = res.find(r => r.log && r.log.includes('AT OK'));
      expect(simRes).toBeDefined();
      expect(String.fromCharCode(...simRes!.bytes)).toContain('OK');
    });

    it('should support HTTP GET action with mock fetch', async () => {
      const mockFetch = vi.fn().mockImplementation(() =>
        Promise.resolve({
          status: 200,
          text: () => Promise.resolve('{"status":"ok"}')
        })
      );
      vi.stubGlobal('fetch', mockFetch);

      const asyncCallback = vi.fn();
      
      // 1. Set URL
      let input = Array.from('AT+HTTPPARA="URL","http://example.com/api"\r\n').map(c => c.charCodeAt(0));
      engine.processIncoming('UART', input);

      // 2. Trigger HTTPACTION=0
      input = Array.from('AT+HTTPACTION=0\r\n').map(c => c.charCodeAt(0));
      const res = engine.processIncoming('UART', input, asyncCallback);
      
      const actionRes = res.find(r => r.log && r.log.includes('HTTPACTION triggered'));
      expect(actionRes).toBeDefined();

      // Wait for async fetch callback to complete
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(mockFetch).toHaveBeenCalledWith('http://example.com/api', {
        method: 'GET',
        headers: undefined,
        body: undefined
      });

      expect(asyncCallback).toHaveBeenCalled();
      const asyncCallArg = asyncCallback.mock.calls[0][0];
      expect(asyncCallArg.log).toContain('HTTP Async Response -> 200');
      expect(String.fromCharCode(...asyncCallArg.bytes)).toContain('+HTTPACTION: 0,200,15');
    });

    it('should upload files using FSCREATE and FSWRITE', () => {
      // 1. Create file
      let input = Array.from('AT+FSCREATE="client.pem"\r\n').map(c => c.charCodeAt(0));
      let res = engine.processIncoming('UART', input);
      expect(res[0].log).toContain('Created file "client.pem"');

      // 2. Start write
      input = Array.from('AT+FSWRITE="client.pem",0,10,5\r\n').map(c => c.charCodeAt(0));
      res = engine.processIncoming('UART', input);
      expect(res[0].log).toContain('Writing 10 bytes to file "client.pem"');
      expect(String.fromCharCode(...res[0].bytes)).toContain('>');

      // 3. Write data bytes
      input = Array.from('CERTIFICATE').map(c => c.charCodeAt(0));
      res = engine.processIncoming('UART', input);
      expect(res[0].log).toContain('Saved file "client.pem" (10 bytes)');
      expect(String.fromCharCode(...res[0].bytes)).toContain('OK');
    });

    it('should configure SSL context using CSSLCFG', () => {
      let input = Array.from('AT+CSSLCFG="authmode",1,3\r\n').map(c => c.charCodeAt(0));
      let res = engine.processIncoming('UART', input);
      expect(res[0].log).toContain('SSL Config -> AuthMode = 3');

      input = Array.from('AT+CSSLCFG="clientcert",1,"client.pem"\r\n').map(c => c.charCodeAt(0));
      res = engine.processIncoming('UART', input);
      expect(res[0].log).toContain('SSL Config -> ClientCert = client.pem');
    });

    it('should fail secure HTTPS action if client auth required but cert/key missing', async () => {
      const asyncCallback = vi.fn();

      // Configure URL and SSL mode requiring client credentials
      engine.processIncoming('UART', Array.from('AT+HTTPPARA="URL","https://secure.example.com"\r\n').map(c => c.charCodeAt(0)));
      engine.processIncoming('UART', Array.from('AT+CSSLCFG="authmode",1,3\r\n').map(c => c.charCodeAt(0)));
      engine.processIncoming('UART', Array.from('AT+CSSLCFG="clientcert",1,"cert.pem"\r\n').map(c => c.charCodeAt(0)));
      engine.processIncoming('UART', Array.from('AT+CSSLCFG="clientkey",1,"key.pem"\r\n').map(c => c.charCodeAt(0)));

      // Trigger HTTP GET action
      const input = Array.from('AT+HTTPACTION=0\r\n').map(c => c.charCodeAt(0));
      engine.processIncoming('UART', input, asyncCallback);

      expect(asyncCallback).toHaveBeenCalled();
      const asyncCallArg = asyncCallback.mock.calls[0][0];
      expect(asyncCallArg.log).toContain('HTTP SSL Handshake Failed');
      expect(String.fromCharCode(...asyncCallArg.bytes)).toContain('+HTTPACTION: 0,603,0');
    });

    it('should validate secure CIPSTART and fail if credentials missing', () => {
      // Configure SSL mutual auth
      engine.processIncoming('UART', Array.from('AT+CSSLCFG="authmode",1,3\r\n').map(c => c.charCodeAt(0)));
      engine.processIncoming('UART', Array.from('AT+CSSLCFG="clientcert",1,"cert.pem"\r\n').map(c => c.charCodeAt(0)));
      engine.processIncoming('UART', Array.from('AT+CSSLCFG="clientkey",1,"key.pem"\r\n').map(c => c.charCodeAt(0)));

      const input = Array.from('AT+CIPSTART="SSL","secure.example.com","443"\r\n').map(c => c.charCodeAt(0));
      const res = engine.processIncoming('UART', input);
      expect(res[0].log).toContain('TCP SSL Connection failed');
      expect(String.fromCharCode(...res[0].bytes)).toContain('CONNECTION FAILED');
    });

    it('should support network/SIM queries', () => {
      let res = engine.processIncoming('UART', Array.from('AT+CPIN?\r\n').map(c => c.charCodeAt(0)));
      expect(res[0].log).toContain('READY');
      expect(String.fromCharCode(...res[0].bytes)).toContain('READY');

      res = engine.processIncoming('UART', Array.from('AT+COPS?\r\n').map(c => c.charCodeAt(0)));
      expect(res[0].log).toContain('Turkcell');

      res = engine.processIncoming('UART', Array.from('AT+CIFSR\r\n').map(c => c.charCodeAt(0)));
      expect(res[0].log).toContain('10.78.12.143');
    });

    it('should support advanced filesystem query commands', () => {
      // 1. Create file and write data
      engine.processIncoming('UART', Array.from('AT+FSCREATE="test.txt"\r\n').map(c => c.charCodeAt(0)));
      engine.processIncoming('UART', Array.from('AT+FSWRITE="test.txt",0,5,5\r\n').map(c => c.charCodeAt(0)));
      engine.processIncoming('UART', Array.from('HELLO').map(c => c.charCodeAt(0)));

      // 2. FSLS
      let res = engine.processIncoming('UART', Array.from('AT+FSLS\r\n').map(c => c.charCodeAt(0)));
      expect(res[0].log).toContain('test.txt');

      // 3. FSFLSIZE
      res = engine.processIncoming('UART', Array.from('AT+FSFLSIZE="test.txt"\r\n').map(c => c.charCodeAt(0)));
      expect(res[0].log).toContain('5 bytes');

      // 4. FSREAD
      res = engine.processIncoming('UART', Array.from('AT+FSREAD="test.txt",0,5,0\r\n').map(c => c.charCodeAt(0)));
      expect(res[0].log).toContain('Read 5 bytes');
      expect(String.fromCharCode(...res[0].bytes)).toContain('HELLO');

      // 5. FSDEL
      res = engine.processIncoming('UART', Array.from('AT+FSDEL="test.txt"\r\n').map(c => c.charCodeAt(0)));
      expect(res[0].log).toContain('Deleted file');
    });

    it('should simulate MQTT and MQTTS operations', () => {
      // 1. Fail publish when not connected
      let res = engine.processIncoming('UART', Array.from('AT+MQTTPUB="sensors","data"\r\n').map(c => c.charCodeAt(0)));
      expect(res[0].log).toContain('Publish failed');

      // 2. Connect
      res = engine.processIncoming('UART', Array.from('AT+MQTTCONN="broker.hivemq.com",1883\r\n').map(c => c.charCodeAt(0)));
      expect(res[0].log).toContain('Connected to MQTT Broker');

      // 3. Subscribe
      res = engine.processIncoming('UART', Array.from('AT+MQTTSUB="telemetry"\r\n').map(c => c.charCodeAt(0)));
      expect(res[0].log).toContain('Subscribed');

      // 4. Publish
      res = engine.processIncoming('UART', Array.from('AT+MQTTPUB="telemetry","value=42"\r\n').map(c => c.charCodeAt(0)));
      expect(res[0].log).toContain('Published');
    });

    it('should support SMS CMGS sending command', () => {
      // 1. Trigger CMGS
      let res = engine.processIncoming('UART', Array.from('AT+CMGS="+905554443322"\r\n').map(c => c.charCodeAt(0)));
      expect(res[0].log).toContain('Preparing SMS');
      expect(String.fromCharCode(...res[0].bytes)).toContain('>');

      // 2. Write body and terminate with Ctrl+Z (0x1A)
      const input = Array.from('Hello SMS').map(c => c.charCodeAt(0));
      input.push(0x1A);
      res = engine.processIncoming('UART', input);
      expect(res[0].log).toContain('Sent SMS to +905554443322');
      expect(String.fromCharCode(...res[0].bytes)).toContain('+CMGS:');
    });
  });
});
