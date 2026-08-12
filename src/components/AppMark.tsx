import clsx from 'clsx';
import markDark from '@/assets/mark-dark.png';
import markLight from '@/assets/mark-light.png';
import { useTheme } from '@/lib/theme';

export function AppMark({ size = 22, className }: { size?: number; className?: string }): JSX.Element {
  const { effective } = useTheme();
  return (
    <img
      src={effective === 'dark' ? markLight : markDark}
      alt=""
      width={size}
      height={size}
      style={{ height: size, width: size }}
      className={clsx('pointer-events-none shrink-0 object-contain', className)}
    />
  );
}
