import { render } from 'preact';
import '../../src/ui/tokens.css';
import './style.css';
import { Options } from './Options';

render(<Options />, document.getElementById('app')!);
