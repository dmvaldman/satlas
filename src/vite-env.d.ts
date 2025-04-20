/// <reference types="vite/client" />

declare module '*?worker' {
  // You can specify the constructor type if you know it, otherwise use WebpackWorker
  // For example: const WorkerFactory: new () => Worker;
  // export default WorkerFactory;
  const workerConstructor: { new (): Worker };
  export default workerConstructor;
}