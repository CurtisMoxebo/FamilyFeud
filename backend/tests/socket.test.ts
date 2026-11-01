import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { io as Client, Socket as ClientSocket } from 'socket.io-client';
import { server, io } from '../src/server';
import { AddressInfo } from 'net';

describe('Backend Regression Suite: Real-time Socket.io Sync', () => {
  let clientSocket: ClientSocket;
  let port: number;

  beforeAll(async () => {
    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        const addr = server.address() as AddressInfo;
        port = addr.port;
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (clientSocket && clientSocket.connected) {
      clientSocket.disconnect();
    }
    io.close();
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it('connects to Socket.io server and receives an assigned socket ID', async () => {
    await new Promise<void>((resolve, reject) => {
      clientSocket = Client(`http://localhost:${port}`, {
        transports: ['websocket'],
      });

      clientSocket.on('connect', () => {
        expect(clientSocket.connected).toBe(true);
        expect(clientSocket.id).toBeDefined();
        expect(typeof clientSocket.id).toBe('string');
        resolve();
      });

      clientSocket.on('connect_error', (err) => {
        reject(err);
      });
    });
  });

  it('handles client disconnection cleanly', async () => {
    expect(clientSocket.connected).toBe(true);
    await new Promise<void>((resolve) => {
      clientSocket.on('disconnect', () => {
        expect(clientSocket.connected).toBe(false);
        resolve();
      });
      clientSocket.disconnect();
    });
  });
});

