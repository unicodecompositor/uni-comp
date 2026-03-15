import React from 'react';
import { ChevronDown } from 'lucide-react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

export const FormatReference: React.FC = () => {
  const [isOpen, setIsOpen] = React.useState(false);
  const [activeSection, setActiveSection] = React.useState<string | null>(null);

  const toggleSection = (id: string) => {
    setActiveSection(prev => prev === id ? null : id);
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors w-full">
        <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        <span>Format Reference</span>
      </CollapsibleTrigger>

      <CollapsibleContent className="mt-3">
        <div className="space-y-4 text-sm">

          {/* ── Basic Syntax ── */}
          <div>
            <h4 className="font-medium text-foreground mb-2">Basic Syntax</h4>
            <code className="block bg-secondary/50 p-2 rounded text-xs font-mono">
              (N):symbol[params]start-end;...
            </code>
            <p className="text-xs text-muted-foreground mt-1.5">
              or rectangular: <code className="bg-secondary/50 px-1 rounded">(W×H)</code>
            </p>
          </div>

          {/* ── Grid Size ── */}
          <div>
            <h4 className="font-medium text-foreground mb-2">Grid Size</h4>
            <ul className="space-y-1.5 text-muted-foreground text-xs">
              <li><span className="text-primary font-mono">(5)</span> — square 5×5</li>
              <li><span className="text-primary font-mono">(10×3)</span> — rectangular 10 cols × 3 rows</li>
              <li><span className="text-primary font-mono">(8x4)</span> — x character also works</li>
            </ul>
          </div>

          {/* ── Escaping ── */}
          <div>
            <h4 className="font-medium text-foreground mb-2">Escaping</h4>
            <ul className="space-y-1.5 text-muted-foreground text-xs">
              <li><span className="text-primary font-mono">"2"</span> — quotes for digits/strings</li>
              <li><span className="text-primary font-mono">'text'</span> — single quotes</li>
              <li><span className="text-primary font-mono">\;</span> — backslash for special chars</li>
            </ul>
          </div>

          {/* ── Symbol Parameters (full schema) ── */}
          <div>
            <button
              type="button"
              onClick={() => toggleSection('params')}
              className="flex items-center gap-1 font-medium text-foreground mb-2 w-full text-left text-sm hover:text-primary transition-colors"
            >
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${activeSection === 'params' ? 'rotate-180' : ''}`} />
              Symbol Parameters
            </button>

            {/* Compact preview always visible */}
            <code className="block bg-secondary/50 p-2 rounded text-xs font-mono mb-2 break-all leading-relaxed">
              [id= ;class= ;n= ;v= ;font= ;d= ;g= ;l= ;z= ;f= ;r= ;s= ;st= ;sp= ;o= ;m= ;p= ;a= ;c= ;b= ;h= ;t= ;k= ;del= ]
            </code>

            {activeSection === 'params' && (
              <div className="space-y-3 border-l-2 border-primary/20 pl-3 mt-2">
                {/* Identity */}
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-1">Identity</p>
                  <ul className="space-y-1 text-muted-foreground text-xs">
                    <li><span className="text-primary font-mono">id=</span> — create <span className="font-mono">#id</span> for cross-references</li>
                    <li><span className="text-primary font-mono">class=</span> — create <span className="font-mono">.class</span></li>
                    <li><span className="text-primary font-mono">n=</span> — create <span className="font-mono">@name</span></li>
                  </ul>
                </div>

                {/* Content */}
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-1">Content</p>
                  <ul className="space-y-1 text-muted-foreground text-xs">
                    <li><span className="text-primary font-mono">v=</span> — content: symbols | <span className="font-mono">#id</span> (nested composition)</li>
                    <li><span className="text-primary font-mono">font=</span> — font family for content</li>
                  </ul>
                </div>

                {/* Layout */}
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-1">Layout</p>
                  <ul className="space-y-1 text-muted-foreground text-xs">
                    <li><span className="text-primary font-mono">d=</span> — area bounds [start, end]</li>
                    <li><span className="text-primary font-mono">g=</span> — grid dimensions</li>
                    <li><span className="text-primary font-mono">l=</span> — layer index / sequence ID</li>
                    <li><span className="text-primary font-mono">z=</span> — z-index / plane for layer</li>
                  </ul>
                </div>

                {/* Transform */}
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-1">Transform</p>
                  <ul className="space-y-1 text-muted-foreground text-xs">
                    <li><span className="text-primary font-mono">f=</span> — flip: <span className="font-mono">h</span>, <span className="font-mono">v</span>, <span className="font-mono">hv</span></li>
                    <li><span className="text-primary font-mono">r=</span> — rotation angle (degrees)</li>
                    <li><span className="text-primary font-mono">s=</span> — scale factor (s=2 or s=2,1.5)</li>
                    <li><span className="text-primary font-mono">st=</span> — trapezoid / taper (st="angle force")</li>
                    <li><span className="text-primary font-mono">sp=</span> — parallelogram / shear (sp="angle force")</li>
                    <li><span className="text-primary font-mono">o=</span> — offset [dx, dy] relative to origin</li>
                  </ul>
                </div>

                {/* Spacing */}
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-1">Spacing</p>
                  <ul className="space-y-1 text-muted-foreground text-xs">
                    <li><span className="text-primary font-mono">m=</span> — margin (1t 0r 0b 0l or CSS-like)</li>
                    <li><span className="text-primary font-mono">p=</span> — padding within bounds</li>
                  </ul>
                </div>

                {/* Appearance */}
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-1">Appearance</p>
                  <ul className="space-y-1 text-muted-foreground text-xs">
                    <li><span className="text-primary font-mono">a=</span> — alpha / opacity (0.0–1.0)</li>
                    <li><span className="text-primary font-mono">c=</span> — color (foreground)</li>
                    <li><span className="text-primary font-mono">b=</span> — background color</li>
                  </ul>
                </div>

                {/* History & Animation */}
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-1">History & Animation</p>
                  <ul className="space-y-1 text-muted-foreground text-xs">
                    <li><span className="text-primary font-mono">h=</span> — history step index</li>
                    <li><span className="text-primary font-mono">k=</span> — keyframe index</li>
                    <li><span className="text-primary font-mono">t=</span> — time / duration (seconds)</li>
                  </ul>
                </div>

                {/* Misc */}
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-1">Misc</p>
                  <ul className="space-y-1 text-muted-foreground text-xs">
                    <li><span className="text-primary font-mono">del=</span> — delete flag (boolean)</li>
                  </ul>
                </div>
              </div>
            )}
          </div>

          {/* ── Streaming & History Blocks ── */}
          <div>
            <button
              type="button"
              onClick={() => toggleSection('streaming')}
              className="flex items-center gap-1 font-medium text-foreground mb-2 w-full text-left text-sm hover:text-primary transition-colors"
            >
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${activeSection === 'streaming' ? 'rotate-180' : ''}`} />
              Streaming & History Blocks
            </button>

            {activeSection === 'streaming' && (
              <div className="space-y-3 border-l-2 border-primary/20 pl-3 mt-2">
                <p className="text-xs text-muted-foreground">
                  Parameters can be split across multiple <code className="bg-secondary/50 px-1 rounded">[]</code> blocks.
                  Both notations are equivalent and parsed identically:
                </p>

                {/* Single block */}
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-1">Single block</p>
                  <code className="block bg-secondary/50 p-2 rounded text-xs font-mono">
                    A[r=45;st=90 30;c=red]0-24
                  </code>
                </div>

                {/* Streaming (split blocks) */}
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-1">Streaming (split blocks)</p>
                  <code className="block bg-secondary/50 p-2 rounded text-xs font-mono">
                    A[r=45][st=90 30][c=red]0-24
                  </code>
                </div>

                {/* History blocks (h=) */}
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-1">History blocks (h=)</p>
                  <code className="block bg-secondary/50 p-2 rounded text-xs font-mono leading-relaxed">
                    A[h=0;r=0][h=1;r+=45][h=2;st+=90 30]0-24
                  </code>
                  <p className="text-xs text-muted-foreground mt-1.5">
                    <span className="font-mono text-primary">h=0</span> — base state.
                    Each subsequent <span className="font-mono text-primary">h=N</span> applies
                    a delta (<span className="font-mono">+=</span> / <span className="font-mono">-=</span>) on top of the previous.
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    History tracks: <span className="font-mono text-primary/80">sp, st, r, s, o, m, p, f, d, l, z, a, c, b, v, font</span>
                  </p>
                </div>

                {/* Keyframe blocks (k=) */}
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-1">Keyframe blocks (k=)</p>
                  <code className="block bg-secondary/50 p-2 rounded text-xs font-mono leading-relaxed">
                    A[k=0;t=0;r=0][k=1;t=2;r+=360]0-24
                  </code>
                  <p className="text-xs text-muted-foreground mt-1.5">
                    <span className="font-mono text-primary">k=N</span> — keyframe index,
                    <span className="font-mono text-primary"> t=</span> — transition duration (seconds).
                    Keyframes interpolate between states for smooth animation.
                  </p>
                </div>

                {/* Full streaming example */}
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-1">Full example</p>
                  <code className="block bg-secondary/50 p-2 rounded text-[10px] font-mono leading-relaxed break-all">
                    (5):A[id=box;c=red][h=0;r=0;s=1,1][h=1;r+=45;st+=90 30]0-24;#box[sp=45 20]0-24
                  </code>
                </div>
              </div>
            )}
          </div>

          {/* ── Index Formula ── */}
          <div>
            <h4 className="font-medium text-foreground mb-2">Index Formula</h4>
            <code className="block bg-secondary/50 p-2 rounded text-xs font-mono">
              index = Y × W + X
            </code>
            <p className="text-xs text-muted-foreground mt-1">
              where X, Y — coordinates, W — grid width
            </p>
          </div>

          {/* ── Comments ── */}
          <div>
            <h4 className="font-medium text-foreground mb-2">Comments (in multi-line)</h4>
            <ul className="space-y-1.5 text-muted-foreground text-xs">
              <li><span className="text-primary font-mono"># comment</span></li>
              <li><span className="text-primary font-mono">// comment</span></li>
              <li><span className="text-primary font-mono">-- comment</span></li>
            </ul>
          </div>

          {/* ── Layers ── */}
          <div>
            <h4 className="font-medium text-foreground mb-2">Layers</h4>
            <p className="text-xs text-muted-foreground">
              First symbol → bottom layer<br/>
              Last symbol → top layer
            </p>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};