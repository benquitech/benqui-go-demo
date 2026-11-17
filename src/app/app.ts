import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { DialogHost } from './shared/dialog';
import { LoadingOverlay } from './shared/loading-overlay';
import { Toaster } from './shared/toast';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Toaster, DialogHost, LoadingOverlay],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<router-outlet /><app-dialog-host /><app-toaster /><app-loading-overlay />`,
})
export class App {}
