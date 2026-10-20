import axios, { AxiosInstance } from 'axios';

import { limitConcurrentRequests } from './request-limiter';

describe('limitConcurrentRequests', () => {
  let instance: AxiosInstance;
  // requests which reached the adapter, i.e. were sent
  let sent: { url?: string; respond: () => void; fail: () => void }[];

  const urls = () => sent.map((request) => request.url);
  const request = (url: string) => {
    // failing requests are expected, so their rejections are not unhandled
    instance.get(url).catch(() => undefined);
  };
  const settle = () => new Promise((resolve) => setImmediate(resolve));

  beforeEach(() => {
    sent = [];
    instance = axios.create({
      adapter: (config) =>
        new Promise((resolve, reject) =>
          sent.push({
            url: config.url,
            respond: () =>
              resolve({
                data: config.url,
                status: 200,
                statusText: 'OK',
                headers: {},
                config,
              }),
            fail: () => reject(new Error('Request failed')),
          }),
        ),
    });
    limitConcurrentRequests(instance, 2);
  });

  it('sends requests up to the maximum without delay', async () => {
    ['a', 'b', 'c'].forEach(request);
    await settle();

    expect(urls()).toEqual(['a', 'b']);
  });

  it('sends waiting requests in order when others finish or fail', async () => {
    ['a', 'b', 'c', 'd'].forEach(request);
    await settle();

    sent[1].respond();
    await settle();
    expect(urls()).toEqual(['a', 'b', 'c']);

    sent[0].fail();
    await settle();
    expect(urls()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('frees the slots when all requests are done', async () => {
    ['a', 'b'].forEach(request);
    await settle();
    sent.forEach((request) => request.respond());
    await settle();

    ['c', 'd', 'e'].forEach(request);
    await settle();

    expect(urls()).toEqual(['a', 'b', 'c', 'd']);
  });

  it.each([NaN, 0])('rejects %s as maximum', (maxRunning) => {
    expect(() => limitConcurrentRequests(axios.create(), maxRunning)).toThrow(
      'Maximum of concurrent requests must be at least 1',
    );
  });
});
