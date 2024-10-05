'use client';

import { useEffect, useRef, useState } from 'react';
import { WebContainer } from '@webcontainer/api';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { files } from './files';


import '@xterm/xterm/css/xterm.css';
import './styles.css';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Code, Play, TerminalIcon, ChevronDown, ChevronUp } from 'lucide-react';

let webcontainerInstance: WebContainer;

export default function NewPage() {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const terminalRef = useRef<HTMLDivElement>(null);
  const [isTerminalOpen, setIsTerminalOpen] = useState(true);

  useEffect(() => {
    const initializeEnvironment = async () => {
      if (!textareaRef.current || !iframeRef.current || !terminalRef.current) return;

      // Set initial content to pages/index.tsx
      const indexContent = (files['pages'] as { directory: { [key: string]: { file: { contents: string } } } })
        .directory['index.tsx'].file.contents;
      textareaRef.current.value = indexContent;

      textareaRef.current.addEventListener("input", (e) => {
        if (e.currentTarget instanceof HTMLTextAreaElement) {
          writeIndexTSX(e.currentTarget.value);
        }
      });

      const fitAddon = new FitAddon();
      const term = new Terminal({
        convertEol: true,
      });
      term.loadAddon(fitAddon);
      term.open(terminalRef.current);
      fitAddon.fit();

      webcontainerInstance = await WebContainer.boot();
      await webcontainerInstance.mount(files);

      term.writeln('Installing dependencies...');
      await installDependencies(term);
      
      term.writeln('Starting dev server...');
      await startDevServer(term);

      webcontainerInstance.on("server-ready", (port, url) => {
        term.writeln(`Server is ready at ${url}`);
        if (iframeRef.current) iframeRef.current.src = url;
      });

      const shellProcess = await startShell(term);
      
      const handleResize = () => {
        fitAddon.fit();
        shellProcess.resize({
          cols: term.cols,
          rows: term.rows,
        });
      };

      window.addEventListener("resize", handleResize);

      return () => {
        window.removeEventListener("resize", handleResize);
        term.dispose();
      };
    };

    initializeEnvironment();
  }, []);

  async function installDependencies(terminal: Terminal) {
    const installProcess = await webcontainerInstance.spawn('npm', ['install']);
    return new Promise<void>((resolve) => {
      installProcess.output.pipeTo(
        new WritableStream({
          write(data) {
            terminal.write(data);
          },
        })
      );
      installProcess.exit.then((exitCode) => {
        if (exitCode !== 0) {
          terminal.writeln(`\r\nInstallation failed with exit code ${exitCode}`);
        } else {
          terminal.writeln('\r\nInstallation completed successfully');
        }
        resolve();
      });
    });
  }

  async function startDevServer(terminal: Terminal) {
    const serverProcess = await webcontainerInstance.spawn('npm', ['run', 'dev']);
    serverProcess.output.pipeTo(
      new WritableStream({
        write(data) {
          terminal.write(data);
        },
      })
    );
  }

  async function startShell(terminal: Terminal) {
    const shellProcess = await webcontainerInstance.spawn("jsh", {
      terminal: {
        cols: terminal.cols,
        rows: terminal.rows,
      },
    });
    shellProcess.output.pipeTo(
      new WritableStream({
        write(data) {
          terminal.write(data);
        },
      })
    );

    const input = shellProcess.input.getWriter();
    terminal.onData((data) => {
      input.write(data);
    });

    return shellProcess;
  }

  async function writeIndexTSX(content: string) {
    await webcontainerInstance.fs.writeFile("/pages/index.tsx", content);
  }

  return (
    <div className="flex flex-col h-screen bg-gray-100">
      <header className="bg-white shadow-sm p-4 flex w-full justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-800">WebContainer Dev Environment</h1>
        <span className="text-sm text-gray-500">by KevIsDev</span>
      </header>
      <main className="flex-grow flex flex-col p-4 space-y-4">
        <div className="flex-grow flex space-x-4">
          <div className="w-1/2 bg-white rounded-lg shadow-md overflow-hidden">
            <div className="bg-gray-800 text-white p-2 flex justify-between items-center">
              <span className="flex items-center"><Code size={18} className="mr-2" /> Editor</span>
              <Button size="sm" variant="ghost"><Play size={18} /></Button>
            </div>
            <Textarea
              ref={textareaRef}
              className="w-full h-[calc(100%-40px)] p-4 font-mono text-sm resize-none focus:outline-none text-black"
            />
          </div>
          <div className="w-1/2 bg-white rounded-lg shadow-md overflow-hidden">
            <div className="bg-gray-800 text-white p-2 flex items-center">
              <Play size={18} className="mr-2" /> Preview
            </div>
              <iframe ref={iframeRef} className="w-full h-[calc(100%-40px)]" />
          </div>
        </div>
        <div className="flex flex-col bg-white rounded-lg shadow-md overflow-hidden">
        <div
          className="bg-gray-800 text-white p-2 flex justify-between items-center cursor-pointer"
          onClick={() => setIsTerminalOpen(!isTerminalOpen)}
        >
          <span className="flex items-center"><TerminalIcon size={18} className="mr-2" /> Terminal</span>
          {isTerminalOpen ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
        </div>
        <div
          className={`flex-grow transition-all duration-300 ease-in-out ${
            isTerminalOpen ? 'h-64' : 'h-0'
          } overflow-hidden`}
        >
          <div ref={terminalRef} className="h-full"></div>
        </div>
      </div>
      </main>
    </div>
  );
}