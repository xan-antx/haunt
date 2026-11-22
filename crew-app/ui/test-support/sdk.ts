// Test stand-in for @kirocrew/app-sdk. Tests replace useAppApi with vi.mock.
export function useAppApi(): { get(path: string): Promise<unknown> } {
  return { get: () => Promise.reject(new Error('No api in tests')) };
}
