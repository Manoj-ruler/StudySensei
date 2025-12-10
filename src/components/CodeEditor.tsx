import React from 'react';
import Editor, { OnMount } from '@monaco-editor/react';

interface CodeEditorProps {
    value: string;
    onChange: (value: string | undefined) => void;
    language?: string;
    theme?: string;
    height?: string;
}

const CodeEditor: React.FC<CodeEditorProps> = ({
    value,
    onChange,
    language = "python",
    theme = "vs-light",
    height = "60vh"
}) => {
    const handleEditorDidMount: OnMount = (editor, monaco) => {
        // Define a custom light theme
        monaco.editor.defineTheme('custom-light', {
            base: 'vs',
            inherit: true,
            rules: [],
            colors: {
                'editor.background': '#ffffff',
                'editor.foreground': '#1f2937',
                'editorLineNumber.foreground': '#9ca3af',
                'editorLineNumber.activeForeground': '#6b7280',
                'editor.selectionBackground': '#ddd6fe',
                'editor.inactiveSelectionBackground': '#e9d5ff',
            }
        });
        monaco.editor.setTheme('custom-light');
    };

    return (
        <div className="border border-gray-200 rounded-lg overflow-hidden bg-white" style={{ height }}>
            <Editor
                height="100%"
                defaultLanguage={language}
                value={value}
                onChange={onChange}
                onMount={handleEditorDidMount}
                theme="vs-light"
                options={{
                    minimap: { enabled: false },
                    fontSize: 14,
                    scrollBeyondLastLine: false,
                    automaticLayout: true,
                    padding: { top: 16 },
                    fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
                    lineHeight: 24,
                }}
            />
        </div>
    );
};

export default CodeEditor;
