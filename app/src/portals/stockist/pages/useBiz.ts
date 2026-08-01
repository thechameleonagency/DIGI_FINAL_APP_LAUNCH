import { useSession } from '../../../store/session';

export function useBiz() {
  const { user, business } = useSession();
  return { user: user!, business: business! };
}
