import { useState } from 'react';
import { DEFAULT_GROUP_COLOR, GROUP_COLOR_PRESETS } from '@/App/constants';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from '@/components/ui/dialog';
import { useI18n } from '@/i18n';
import { EmojiPicker } from './EmojiPicker';

interface CreateGroupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (name: string, emoji: string, color: string) => void;
}

export function CreateGroupDialog({ open, onOpenChange, onSubmit }: CreateGroupDialogProps) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('');
  const [color, setColor] = useState<string>(DEFAULT_GROUP_COLOR);

  const handleSubmit = () => {
    if (name.trim()) {
      onSubmit(name.trim(), emoji, color);
      setName('');
      setEmoji('');
      setColor(DEFAULT_GROUP_COLOR);
      onOpenChange(false);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setName('');
      setEmoji('');
      setColor(DEFAULT_GROUP_COLOR);
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogPopup className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('New Group')}</DialogTitle>
        </DialogHeader>
        <DialogPanel>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">{t('Group Name')}</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                placeholder={t('e.g. Work Projects')}
                className="mt-2 w-full h-9 rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                autoFocus
              />
            </div>
            <div>
              <label className="text-sm font-medium">{t('Icon')}</label>
              <div className="mt-2">
                <EmojiPicker value={emoji} onChange={setEmoji} />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">{t('Color')}</label>
              <div className="mt-2 grid grid-cols-8 gap-2">
                {GROUP_COLOR_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    className="h-6 w-6 rounded-md border"
                    style={{
                      backgroundColor: preset,
                      outline: color === preset ? `2px solid ${preset}` : undefined,
                      outlineOffset: 2,
                    }}
                    onClick={() => setColor(preset)}
                    aria-label={preset}
                  />
                ))}
              </div>
              <div className="mt-3 flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{t('Custom color')}</span>
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="h-8 w-10 rounded-md border bg-background p-1"
                  aria-label={t('Custom color')}
                />
              </div>
            </div>
          </div>
        </DialogPanel>
        <DialogFooter variant="bare">
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            {t('Cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={!name.trim()}>
            {t('Create')}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
