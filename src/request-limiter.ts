import { AxiosInstance } from 'axios';

/**
 * Lets at most maxRunning requests of the axios instance run at once, further
 * requests wait in the order of their start.
 */
export function limitConcurrentRequests(
  // only the interceptors, so that the ESM typings of axios used by @nestjs/axios fit as well
  axios: Pick<AxiosInstance, 'interceptors'>,
  maxRunning: number,
) {
  // a missing or invalid value would otherwise let every request wait forever
  if (!(maxRunning >= 1)) {
    throw new Error(`Maximum of concurrent requests must be at least 1`);
  }
  let running = 0;
  const waiting: (() => void)[] = [];

  axios.interceptors.request.use((config) => {
    if (running < maxRunning) {
      running++;
      return config;
    }
    return new Promise((resolve) => waiting.push(() => resolve(config)));
  });

  // a finished request hands its slot directly to the next waiting one
  const release = () => {
    const next = waiting.shift();
    if (next) {
      next();
    } else {
      running = Math.max(0, running - 1);
    }
  };
  axios.interceptors.response.use(
    (response) => {
      release();
      return response;
    },
    (error) => {
      release();
      return Promise.reject(error);
    },
  );
}
