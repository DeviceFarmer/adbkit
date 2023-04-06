export default interface Device {
  id: string;
  type: 'emulator' | 'device' | 'offline' | 'unauthorized';
}
