import { Redirect } from 'expo-router';

export default function Index() {
  // Redirige automáticamente a la pestaña de inicio dentro de (tabs)
  return <Redirect href={"/(tabs)/login" as any} />;
}