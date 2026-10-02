import { render } from 'preact';
import '../../src/ui/tokens.css';
import './style.css';
import { App } from './App';

render(<App />, document.getElementById('app')!);
