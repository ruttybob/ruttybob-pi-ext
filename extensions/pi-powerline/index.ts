import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import type { AutocompleteItem } from '@earendil-works/pi-tui';
import { registerEditor } from './editor.ts';
import { registerFooter } from './footer.ts';
import { registerWidget } from './widget.ts';
import { readPowerlineSettings, writePowerlineSetting } from './settings.ts';

export default function (pi: ExtensionAPI) {
  // register sub-extensions (no header)
  registerEditor(pi);
  registerFooter(pi);
  registerWidget(pi);

  // unified /powerline command
  pi.registerCommand('powerline', {
    description: 'Configure powerline: breadcrumb, footer',
    getArgumentCompletions: (prefix: string): AutocompleteItem[] | null => {
      const items: AutocompleteItem[] = [
        {
          value: 'info',
          label: 'info',
          description: 'Show current powerline settings',
        },
        {
          value: 'breadcrumb:hide',
          label: 'breadcrumb:hide',
          description: 'No breadcrumb display',
        },
        {
          value: 'breadcrumb:top',
          label: 'breadcrumb:top',
          description: 'Breadcrumb as a widget above the editor',
        },
        {
          value: 'breadcrumb:inner',
          label: 'breadcrumb:inner',
          description: 'Breadcrumb embedded in editor top border',
        },
        {
          value: 'footer:on',
          label: 'footer:on',
          description: 'Enable custom footer',
        },
        {
          value: 'footer:off',
          label: 'footer:off',
          description: 'Disable custom footer',
        },
      ];
      if (!prefix) return items;
      return items.filter((i) => i.value.startsWith(prefix));
    },
    handler: async (args, ctx) => {
      const arg = args?.trim().toLowerCase();

      // no args: toggle master switch
      if (!arg) {
        const { powerline } = readPowerlineSettings(ctx.cwd);
        const next = !powerline;
        writePowerlineSetting(ctx.cwd, 'powerline', next);
        pi.events.emit('powerline_settings_changed', ctx);
        ctx.ui.notify(`powerline → ${next ? 'on' : 'off'}`, 'info');
        return;
      }

      // show status
      if (arg === 'info') {
        const { powerline, breadcrumb, footer } = readPowerlineSettings(ctx.cwd);
        const lines = [
          `powerline: ${powerline ? 'on' : 'off'}`,
          `breadcrumb: ${breadcrumb}`,
          `footer: ${footer ? 'on' : 'off'}`,
        ];
        ctx.ui.notify(lines.join('\n'), 'info');
        return;
      }

      // parse namespace:value
      const colonIdx = arg.indexOf(':');
      if (colonIdx === -1) {
        ctx.ui.notify(
          'Usage: /powerline <info|breadcrumb:hide|top|inner|footer:on|off>',
          'warning',
        );
        return;
      }

      const ns = arg.slice(0, colonIdx);
      const val = arg.slice(colonIdx + 1);
      let msg = '';

      switch (ns) {
        case 'breadcrumb': {
          if (!['hide', 'top', 'inner'].includes(val)) {
            ctx.ui.notify('breadcrumb must be: hide, top, or inner', 'warning');
            return;
          }
          writePowerlineSetting(ctx.cwd, 'breadcrumb', val);
          pi.events.emit('powerline_settings_changed', ctx);
          msg = `breadcrumb → ${val}`;
          break;
        }
        case 'footer': {
          if (val !== 'on' && val !== 'off') {
            ctx.ui.notify('footer must be: on or off', 'warning');
            return;
          }
          writePowerlineSetting(ctx.cwd, 'footer', val === 'on');
          pi.events.emit('powerline_settings_changed', ctx);
          msg = `footer → ${val}`;
          break;
        }
        default:
          ctx.ui.notify(
            'Usage: /powerline <breadcrumb:hide|top|inner|footer:on|off>',
            'warning',
          );
          return;
      }

      ctx.ui.notify(msg, 'info');
    },
  });
}
