import { Fingerprint, Hash } from 'lucide-react';
import { Input, Switch } from '@/components/ui';

export const MIN_PIN_LENGTH = 4;

export function DevicePinFields({
  pin,
  confirmPin,
  useBiometrics,
  biometricsAvailable,
  onPin,
  onConfirmPin,
  onUseBiometrics,
}: {
  pin: string;
  confirmPin: string;
  useBiometrics: boolean;
  biometricsAvailable: boolean;
  onPin: (value: string) => void;
  onConfirmPin: (value: string) => void;
  onUseBiometrics: (value: boolean) => void;
}): JSX.Element {
  const tooShort = pin.length > 0 && pin.length < MIN_PIN_LENGTH;
  const mismatch = confirmPin.length > 0 && confirmPin !== pin;

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 dark:border-slate-800 dark:bg-slate-800/30">
      <Input
        type="password"
        size="sm"
        label="Device PIN"
        value={pin}
        autoComplete="off"
        leading={<Hash size={14} />}
        error={tooShort ? `Use at least ${MIN_PIN_LENGTH} characters` : undefined}
        hint={
          tooShort
            ? undefined
            : 'Asked for every time this device unlocks the vault without the master password.'
        }
        onChange={(e) => onPin(e.target.value)}
      />
      <Input
        type="password"
        size="sm"
        label="Confirm PIN"
        value={confirmPin}
        autoComplete="off"
        leading={<Hash size={14} />}
        error={mismatch ? 'The two PINs do not match' : undefined}
        onChange={(e) => onConfirmPin(e.target.value)}
      />
      {biometricsAvailable && (
        <Switch
          checked={useBiometrics}
          onChange={onUseBiometrics}
          size="sm"
          label={
            <span className="flex items-center gap-1.5">
              <Fingerprint size={13} />
              Allow Touch ID instead of typing the PIN
            </span>
          }
          description="The PIN is kept in the system keychain and only released after Touch ID approves."
        />
      )}
    </div>
  );
}

export function pinReady(pin: string, confirmPin: string): boolean {
  return pin.length >= MIN_PIN_LENGTH && pin === confirmPin;
}
