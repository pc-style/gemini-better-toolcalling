import React, { useEffect, useMemo, useState } from "react";
import { Box, Text, render, useApp, useInput } from "ink";

import { runBenchmark, type BenchmarkResult } from "./src/benchmark";
import type { ReasoningEffort } from "./src/generation-settings";
import { getModelOptions, probeModelAvailability } from "./src/model-catalog";
import { PROMPT_PRESETS } from "./src/prompt-presets";
import { createFileLogger } from "./src/run-logger";
import {
  STRATEGIES,
  resolveDefaultModel,
  runStrategy,
  type PlaygroundResult,
  type Strategy,
} from "./src/strategy-runner";
import { getMenuWindow } from "./src/tui-menu-window";

type AppMode = "single" | "benchmark";
type Screen =
  | "mode"
  | "strategy"
  | "prompt"
  | "custom-prompt"
  | "model"
  | "settings"
  | "running"
  | "result";

type BenchmarkStrategyScope = "all" | Strategy;

interface RuntimeSettings {
  thinking: boolean;
  includeThoughts: boolean;
  reasoningEffort: ReasoningEffort;
  maxRetries: number;
  logs: boolean;
  verbose: boolean;
  routerMaxTurns: number;
  hybridMaxTurns: number;
  iterations: number;
  benchmarkStrategyScope: BenchmarkStrategyScope;
  benchmarkAllModels: boolean;
}

interface SelectionState {
  mode: AppMode;
  strategy: Strategy;
  promptIndex: number;
  customPrompt: string;
  model: string;
  settings: RuntimeSettings;
}

const CUSTOM_PROMPT_LABEL = "Custom prompt";
const BENCHMARK_ALL_PRESETS_LABEL = "All presets";
const MAX_VISIBLE_MENU_OPTIONS = 10;

function App(): React.JSX.Element {
  const { exit } = useApp();
  const [screen, setScreen] = useState<Screen>("mode");

  const [selection, setSelection] = useState<SelectionState>({
    mode: "single",
    strategy: STRATEGIES[0],
    promptIndex: 0,
    customPrompt: "",
    model: "gemini-3-flash-preview",
    settings: {
      thinking: true,
      includeThoughts: false,
      reasoningEffort: "medium",
      maxRetries: 1,
      logs: true,
      verbose: false,
      routerMaxTurns: 4,
      hybridMaxTurns: 4,
      iterations: 1,
      benchmarkStrategyScope: "all",
      benchmarkAllModels: false,
    },
  });

  const [modeIndex, setModeIndex] = useState(0);
  const [strategyIndex, setStrategyIndex] = useState(0);
  const [promptIndex, setPromptIndex] = useState(0);
  const [modelIndex, setModelIndex] = useState(0);
  const [settingsIndex, setSettingsIndex] = useState(0);
  const [showRawJson, setShowRawJson] = useState(false);
  const [singleResult, setSingleResult] = useState<PlaygroundResult | null>(null);
  const [benchmarkResult, setBenchmarkResult] = useState<BenchmarkResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [runLogs, setRunLogs] = useState<string[]>([]);
  const [runLogFilePath, setRunLogFilePath] = useState<string | null>(null);
  const [runningStartedRuns, setRunningStartedRuns] = useState(0);
  const [runningTotalRuns, setRunningTotalRuns] = useState(0);
  const [isValidatingModel, setIsValidatingModel] = useState(false);
  const [modelValidationError, setModelValidationError] = useState<string | null>(null);
  const [modelOptions, setModelOptions] = useState<string[]>([
    "gemini-3.1-pro-preview",
    "gemini-3-pro-preview",
    "gemini-3-flash-preview",
    "gemini-2.5-pro",
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
  ]);

  useEffect(() => {
    void (async () => {
      try {
        const [preferredModel, discoveredModels] = await Promise.all([
          resolveDefaultModel(),
          getModelOptions(),
        ]);
        const merged = [...new Set([preferredModel, ...discoveredModels])];
        setModelOptions(merged);
        setSelection((prev) => ({ ...prev, model: preferredModel }));
      } catch {
        // keep fallback defaults
      }
    })();
  }, []);

  useEffect(() => {
    const index = modelOptions.findIndex((item) => item === selection.model);
    if (index >= 0) {
      setModelIndex(index);
    }
  }, [modelOptions, selection.model]);

  const modeOptions = ["Single run", "Benchmark"];
  const promptOptionsForSingle = [
    ...PROMPT_PRESETS.map((preset) => preset.title),
    CUSTOM_PROMPT_LABEL,
  ];
  const promptOptionsForBenchmark = [
    BENCHMARK_ALL_PRESETS_LABEL,
    ...PROMPT_PRESETS.map((preset) => preset.title),
  ];
  const promptOptions =
    selection.mode === "single" ? promptOptionsForSingle : promptOptionsForBenchmark;

  const effectiveSinglePrompt = useMemo(() => {
    if (selection.promptIndex === PROMPT_PRESETS.length) {
      return selection.customPrompt.trim();
    }
    return PROMPT_PRESETS[selection.promptIndex]?.prompt ?? "";
  }, [selection.customPrompt, selection.promptIndex]);

  useInput((input, key) => {
    if ((input === "c" && key.ctrl) || input === "q") {
      exit();
      return;
    }

    if (screen === "running") {
      if (key.escape) {
        setError("Run cancelled by user.");
        setScreen("result");
      }
      return;
    }

    if (screen === "mode") {
      if (key.downArrow) {
        setModeIndex((value) => Math.min(value + 1, modeOptions.length - 1));
        return;
      }
      if (key.upArrow) {
        setModeIndex((value) => Math.max(value - 1, 0));
        return;
      }
      if (key.return) {
        const mode: AppMode = modeIndex === 0 ? "single" : "benchmark";
        setSelection((prev) => ({ ...prev, mode }));
        setScreen(mode === "single" ? "strategy" : "prompt");
      }
      return;
    }

    if (screen === "strategy") {
      if (key.downArrow) {
        setStrategyIndex((value) => Math.min(value + 1, STRATEGIES.length - 1));
        return;
      }
      if (key.upArrow) {
        setStrategyIndex((value) => Math.max(value - 1, 0));
        return;
      }
      if (key.escape) {
        setScreen("mode");
        return;
      }
      if (key.return) {
        setSelection((prev) => ({
          ...prev,
          strategy: STRATEGIES[strategyIndex] ?? prev.strategy,
        }));
        setScreen("prompt");
      }
      return;
    }

    if (screen === "prompt") {
      if (key.downArrow) {
        setPromptIndex((value) => Math.min(value + 1, promptOptions.length - 1));
        return;
      }
      if (key.upArrow) {
        setPromptIndex((value) => Math.max(value - 1, 0));
        return;
      }
      if (key.escape) {
        setScreen(selection.mode === "single" ? "strategy" : "mode");
        return;
      }
      if (key.return) {
        setSelection((prev) => ({ ...prev, promptIndex }));
        if (selection.mode === "single" && promptIndex === PROMPT_PRESETS.length) {
          setScreen("custom-prompt");
          return;
        }
        setScreen("model");
      }
      return;
    }

    if (screen === "custom-prompt") {
      if (key.escape) {
        setScreen("prompt");
        return;
      }
      if (key.return) {
        if (selection.customPrompt.trim().length > 0) {
          setScreen("model");
        }
        return;
      }
      if (key.backspace || key.delete) {
        setSelection((prev) => ({
          ...prev,
          customPrompt: prev.customPrompt.slice(0, -1),
        }));
        return;
      }
      if (
        input.length > 0 &&
        !key.ctrl &&
        !key.meta &&
        !key.upArrow &&
        !key.downArrow &&
        !key.leftArrow &&
        !key.rightArrow
      ) {
        setSelection((prev) => ({
          ...prev,
          customPrompt: prev.customPrompt + input,
        }));
      }
      return;
    }

    if (screen === "model") {
      if (isValidatingModel) {
        return;
      }

      if (key.downArrow) {
        setModelIndex((value) => Math.min(value + 1, modelOptions.length - 1));
        return;
      }
      if (key.upArrow) {
        setModelIndex((value) => Math.max(value - 1, 0));
        return;
      }
      if (key.escape) {
        setScreen(selection.mode === "single" && selection.promptIndex === PROMPT_PRESETS.length
          ? "custom-prompt"
          : "prompt");
        return;
      }
      if (key.return) {
        const selectedModel = modelOptions[modelIndex] ?? selection.model;
        setModelValidationError(null);
        setIsValidatingModel(true);
        void (async () => {
          try {
            await probeModelAvailability(selectedModel);
            setSelection((prev) => ({ ...prev, model: selectedModel }));
            setSettingsIndex(0);
            setScreen("settings");
          } catch (unknownError) {
            const message =
              unknownError instanceof Error ? unknownError.message : String(unknownError);
            setModelValidationError(`Model check failed for '${selectedModel}': ${message}`);
          } finally {
            setIsValidatingModel(false);
          }
        })();
      }
      return;
    }

    if (screen === "settings") {
      const fields = getSettingsFields(selection.mode, selection.settings);
      if (key.downArrow) {
        setSettingsIndex((value) => Math.min(value + 1, fields.length - 1));
        return;
      }
      if (key.upArrow) {
        setSettingsIndex((value) => Math.max(value - 1, 0));
        return;
      }
      if (key.escape) {
        setScreen("model");
        return;
      }
      if (key.leftArrow) {
        adjustSetting(selection.mode, fields[settingsIndex]?.key, -1, setSelection);
        return;
      }
      if (key.rightArrow) {
        adjustSetting(selection.mode, fields[settingsIndex]?.key, 1, setSelection);
        return;
      }
      if (key.return) {
        setSingleResult(null);
        setBenchmarkResult(null);
        setError(null);
        setShowRawJson(false);
        setRunLogs([]);
        setRunLogFilePath(null);
        setRunningStartedRuns(0);
        setRunningTotalRuns(0);
        setScreen("running");
      }
      return;
    }

    if (screen === "result") {
      if (input === "r") {
        setSingleResult(null);
        setBenchmarkResult(null);
        setError(null);
        setRunLogs([]);
        setRunLogFilePath(null);
        setRunningStartedRuns(0);
        setRunningTotalRuns(0);
        setScreen("running");
        return;
      }
      if (input === "o") {
        setScreen("mode");
        return;
      }
      if (input === "s" && selection.mode === "single") {
        setScreen("strategy");
        return;
      }
      if (input === "p") {
        setScreen("prompt");
        return;
      }
      if (input === "m") {
        setScreen("model");
        return;
      }
      if (input === "g") {
        setScreen("settings");
        return;
      }
      if (input === "t") {
        setShowRawJson((value) => !value);
      }
    }
  });

  useEffect(() => {
    if (screen !== "running") {
      return;
    }

    let cancelled = false;
    void (async () => {
      const selectedPreset =
        selection.promptIndex > 0
          ? PROMPT_PRESETS[selection.promptIndex - 1]
          : undefined;
      const selectedPresets =
        selection.promptIndex === 0
          ? PROMPT_PRESETS
          : selectedPreset
            ? [selectedPreset]
            : PROMPT_PRESETS;
      const selectedStrategies =
        selection.settings.benchmarkStrategyScope === "all"
          ? [...STRATEGIES]
          : [selection.settings.benchmarkStrategyScope];
      const selectedModels = selection.settings.benchmarkAllModels
        ? modelOptions
        : [selection.model];
      const benchmarkTotalRuns =
        selectedModels.length * selectedStrategies.length * selectedPresets.length * selection.settings.iterations;
      setRunningStartedRuns(0);
      setRunningTotalRuns(selection.mode === "benchmark" ? benchmarkTotalRuns : 1);
      let fileLogger: ReturnType<typeof createFileLogger> | null = null;
      if (selection.settings.logs) {
        try {
          fileLogger = createFileLogger("tui");
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          setRunLogs((prev) => [
            ...prev.slice(-25),
            `[warn] file logging unavailable: ${message}`,
          ]);
          fileLogger = null;
        }
      }
      setRunLogFilePath(fileLogger?.path ?? null);
      if (fileLogger) {
        setRunLogs((prev) => [...prev.slice(-25), `[log-file] ${fileLogger.path}`]);
      }

      const logger = (line: string): void => {
        setRunLogs((prev) => [...prev.slice(-25), line]);
        fileLogger?.log(line);
        if (line.startsWith("[bench]")) {
          setRunningStartedRuns((prev) => prev + 1);
        }
      };

      try {
        if (selection.mode === "single") {
          const result = await runStrategy({
            strategy: selection.strategy,
            prompt: effectiveSinglePrompt,
            model: selection.model,
            maxRetries: selection.settings.maxRetries,
            logs: selection.settings.logs,
            verbose: selection.settings.verbose,
            routerMaxTurns: selection.settings.routerMaxTurns,
            hybridMaxTurns: selection.settings.hybridMaxTurns,
            generationSettings: {
              thinking: selection.settings.thinking,
              includeThoughts: selection.settings.includeThoughts,
              reasoningEffort: selection.settings.reasoningEffort,
            },
            logger,
          });

          if (!cancelled) {
            setSingleResult(result);
            setBenchmarkResult(null);
            setError(null);
            setScreen("result");
          }
          return;
        }

        const benchmark = await runBenchmark({
          models: selectedModels,
          strategies: selectedStrategies,
          presets: selectedPresets,
          iterations: selection.settings.iterations,
          maxRetries: selection.settings.maxRetries,
          logs: selection.settings.logs,
          verbose: selection.settings.verbose,
          routerMaxTurns: selection.settings.routerMaxTurns,
          hybridMaxTurns: selection.settings.hybridMaxTurns,
          generationSettings: {
            thinking: selection.settings.thinking,
            includeThoughts: selection.settings.includeThoughts,
            reasoningEffort: selection.settings.reasoningEffort,
          },
          logger,
        });

        if (!cancelled) {
          setBenchmarkResult(benchmark);
          setSingleResult(null);
          setError(null);
          setScreen("result");
        }
      } catch (unknownError) {
        const message =
          unknownError instanceof Error ? unknownError.message : String(unknownError);
        if (!cancelled) {
          setError(message);
          setSingleResult(null);
          setBenchmarkResult(null);
          setScreen("result");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    effectiveSinglePrompt,
    modelOptions,
    screen,
    selection.mode,
    selection.model,
    selection.promptIndex,
    selection.settings,
    selection.strategy,
  ]);

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      <Box borderStyle="round" borderColor="cyan" paddingX={1} paddingY={0} flexDirection="column">
        <Text bold color="cyanBright">
          Gemini Tool Playground
        </Text>
        <Text dimColor>q: quit | o: mode | p: prompt | m: model | g: settings</Text>
        <Text color="gray">
          Mode: {selection.mode} | Model: {selection.model} | Thinking:{" "}
          {selection.settings.thinking ? "on" : "off"} ({selection.settings.reasoningEffort})
        </Text>
      </Box>

      <Box marginTop={1} flexDirection="column">
        {screen === "mode" && (
          <MenuList
            title="1) Select Mode"
            options={modeOptions}
            selectedIndex={modeIndex}
            footer="Enter: next"
          />
        )}

        {screen === "strategy" && (
          <MenuList
            title="2) Select Strategy"
            options={STRATEGIES.map((item) => item)}
            selectedIndex={strategyIndex}
            footer="Enter: next | Esc: back"
          />
        )}

        {screen === "prompt" && (
          <MenuList
            title={selection.mode === "single" ? "3) Select Prompt" : "2) Select Benchmark Presets"}
            options={promptOptions}
            selectedIndex={promptIndex}
            details={promptDetails(selection.mode, promptIndex)}
            footer="Enter: next | Esc: back"
          />
        )}

        {screen === "custom-prompt" && (
          <Box flexDirection="column">
            <Text bold>Custom Prompt</Text>
            <Text color="yellow">
              {selection.customPrompt.length > 0
                ? selection.customPrompt
                : "Type your prompt..."}
              <Text color="green">█</Text>
            </Text>
            <Text dimColor>Enter: next | Esc: back</Text>
          </Box>
        )}

        {screen === "model" && (
          <Box flexDirection="column">
            <MenuList
              title={selection.mode === "single" ? "4) Select Model" : "3) Select Primary Model"}
              options={modelOptions}
              selectedIndex={modelIndex}
              footer={
                isValidatingModel
                  ? "Validating selected model with Gemini API..."
                  : "Enter: validate + settings | Esc: back"
              }
              maxVisible={MAX_VISIBLE_MENU_OPTIONS}
            />
            {isValidatingModel ? (
              <Text color="yellow">Checking model availability...</Text>
            ) : null}
            {modelValidationError ? (
              <Text color="red">{modelValidationError}</Text>
            ) : null}
          </Box>
        )}

        {screen === "settings" && (
          <SettingsList
            mode={selection.mode}
            settings={selection.settings}
            selectedIndex={settingsIndex}
          />
        )}

        {screen === "running" && (
          <RunningView
            mode={selection.mode}
            logs={runLogs}
            startedRuns={runningStartedRuns}
            totalRuns={runningTotalRuns}
            logFilePath={runLogFilePath}
          />
        )}

        {screen === "result" && (
          <ResultView
            mode={selection.mode}
            singleResult={singleResult}
            benchmarkResult={benchmarkResult}
            error={error}
            showRawJson={showRawJson}
            logFilePath={runLogFilePath}
          />
        )}
      </Box>
    </Box>
  );
}

function MenuList(props: {
  title: string;
  options: string[];
  selectedIndex: number;
  details?: string;
  footer: string;
  maxVisible?: number;
}): React.JSX.Element {
  const maxVisible = props.maxVisible ?? props.options.length;
  const window = getMenuWindow(props.options.length, props.selectedIndex, maxVisible);
  const visibleOptions = props.options.slice(window.start, window.end);
  const scrollable = props.options.length > maxVisible;

  return (
    <Box flexDirection="column" borderStyle="single" borderColor="gray" paddingX={1}>
      <Text bold color="blueBright">
        {props.title}
      </Text>
      <Text dimColor>
        {props.options.length} option{props.options.length === 1 ? "" : "s"}
      </Text>
      {scrollable && window.start > 0 ? <Text color="gray">↑ more</Text> : null}
      {visibleOptions.map((option, index) => {
        const absoluteIndex = window.start + index;
        const selected = absoluteIndex === props.selectedIndex;
        return (
          <Text
            key={`${option}-${absoluteIndex}`}
            color={selected ? "black" : "white"}
            backgroundColor={selected ? "green" : undefined}
          >
            {selected ? "› " : "  "}
            {absoluteIndex + 1}. {option}
          </Text>
        );
      })}
      {scrollable && window.end < props.options.length ? (
        <Text color="gray">↓ more</Text>
      ) : null}
      {props.details ? <Text dimColor>{props.details}</Text> : null}
      <Text dimColor>
        {scrollable ? `${props.footer} | ↑/↓: scroll` : props.footer}
      </Text>
    </Box>
  );
}

function SettingsList(props: {
  mode: AppMode;
  settings: RuntimeSettings;
  selectedIndex: number;
}): React.JSX.Element {
  const fields = getSettingsFields(props.mode, props.settings);
  return (
    <Box flexDirection="column">
      <Text bold>{props.mode === "single" ? "5) Settings" : "4) Benchmark Settings"}</Text>
      {fields.map((field, index) => (
        <Text
          key={field.key}
          color={index === props.selectedIndex ? "green" : undefined}
        >
          {index === props.selectedIndex ? "› " : "  "}
          {field.label}: {field.value}
        </Text>
      ))}
      <Text dimColor>Left/Right: change | Enter: run | Esc: back</Text>
    </Box>
  );
}

function RunningView(props: {
  mode: AppMode;
  logs: string[];
  startedRuns: number;
  totalRuns: number;
  logFilePath: string | null;
}): React.JSX.Element {
  const progressLabel =
    props.mode === "benchmark" && props.totalRuns > 0
      ? `Progress: ${Math.min(props.startedRuns, props.totalRuns)}/${props.totalRuns} runs started`
      : null;

  return (
    <Box flexDirection="column">
      <Text bold color="yellow">
        Running {props.mode === "single" ? "single strategy" : "benchmark"}...
      </Text>
      {progressLabel ? <Text color="cyan">{progressLabel}</Text> : null}
      {props.logs.length > 0 ? (
        <Box flexDirection="column" marginTop={1}>
          <Text bold>Live logs</Text>
          {props.logs.slice(-12).map((line, index) => (
            <Text key={`${line}-${index}`} dimColor>
              {line}
            </Text>
          ))}
        </Box>
      ) : (
        <Text dimColor>Waiting for first output...</Text>
      )}
      {props.logFilePath ? <Text dimColor>Log file: {props.logFilePath}</Text> : null}
      <Text dimColor>Esc: cancel run</Text>
    </Box>
  );
}

function ResultView(props: {
  mode: AppMode;
  singleResult: PlaygroundResult | null;
  benchmarkResult: BenchmarkResult | null;
  error: string | null;
  showRawJson: boolean;
  logFilePath: string | null;
}): React.JSX.Element {
  if (props.error) {
    return (
      <Box flexDirection="column">
        <Text bold color="red">
          Run failed
        </Text>
        <Text>{props.error}</Text>
        {props.logFilePath ? <Text dimColor>Log file: {props.logFilePath}</Text> : null}
        <Text dimColor>r: rerun | o: mode | p: prompt | m: model | g: settings</Text>
      </Box>
    );
  }

  if (props.mode === "single" && props.singleResult) {
    const thoughtTrace = props.singleResult.trace.filter((step) => step.kind === "thought");
    return (
      <Box flexDirection="column">
        <Text bold color="green">
          Single run complete
        </Text>
        <Text>Strategy: {props.singleResult.usedStrategy}</Text>
        <Text>Model: {props.singleResult.usedModel}</Text>
        <Text>Attempts: {props.singleResult.attempts}</Text>
        <Text>Duration: {props.singleResult.durationMs}ms</Text>
        <Text>Tool calls: {props.singleResult.toolCalls.length}</Text>
        {props.singleResult.toolCalls.slice(0, 4).map((call, index) => (
          <Text key={`${call.toolName}-${index}`} dimColor>
            tool[{index + 1}] {call.toolName} repaired={call.repaired ? "yes" : "no"} args=
            {truncateForUi(JSON.stringify(call.args), 110)}
          </Text>
        ))}
        {props.singleResult.toolCalls.length > 4 ? (
          <Text dimColor>... {props.singleResult.toolCalls.length - 4} more tool calls</Text>
        ) : null}
        <Text>Thought steps: {thoughtTrace.length}</Text>
        {thoughtTrace.slice(0, 3).map((step, index) => (
          <Text key={`${step.detail}-${index}`} dimColor>
            thought[{index + 1}] {truncateForUi(String(step.data?.text ?? ""), 140)}
          </Text>
        ))}
        {thoughtTrace.length > 3 ? (
          <Text dimColor>... {thoughtTrace.length - 3} more thought entries</Text>
        ) : null}
        <Text>Final: {props.singleResult.finalText || "(empty)"}</Text>
        {props.showRawJson ? (
          <Text>{JSON.stringify(props.singleResult, null, 2)}</Text>
        ) : null}
        {props.logFilePath ? <Text dimColor>Log file: {props.logFilePath}</Text> : null}
        <Text dimColor>r: rerun | t: raw json | o: mode | p: prompt | m: model | g: settings</Text>
      </Box>
    );
  }

  if (props.mode === "benchmark" && props.benchmarkResult) {
    const success = props.benchmarkResult.records.filter((item) => item.success).length;
    const total = props.benchmarkResult.records.length;
    return (
      <Box flexDirection="column">
        <Text bold color="green">
          Benchmark complete
        </Text>
        <Text>Total runs: {total}</Text>
        <Text>
          Success: {success}/{total} ({total > 0 ? ((success / total) * 100).toFixed(1) : "0.0"}
          %)
        </Text>
        <Text bold>Aggregate</Text>
        {props.benchmarkResult.aggregates.map((row) => (
          <Text key={row.key}>
            {row.strategy} | {row.model} | success {(row.successRate * 100).toFixed(1)}% | avg{" "}
            {row.avgDurationMs}ms
          </Text>
        ))}
        {props.showRawJson ? (
          <Text>{JSON.stringify(props.benchmarkResult, null, 2)}</Text>
        ) : null}
        {props.logFilePath ? <Text dimColor>Log file: {props.logFilePath}</Text> : null}
        <Text dimColor>r: rerun | t: raw json | o: mode | p: prompt | m: model | g: settings</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text>No result to display.</Text>
      <Text dimColor>r: rerun | o: mode</Text>
    </Box>
  );
}

function promptDetails(mode: AppMode, index: number): string {
  if (mode === "benchmark") {
    if (index === 0) {
      return "Run against all preset prompts.";
    }
    const preset = PROMPT_PRESETS[index - 1];
    return preset
      ? `${preset.description} | recommended ${preset.recommendedStrategy}`
      : "Preset unavailable";
  }

  if (index >= PROMPT_PRESETS.length) {
    return "Type your own prompt.";
  }
  const preset = PROMPT_PRESETS[index];
  return preset
    ? `${preset.description} | recommended ${preset.recommendedStrategy}`
    : "Preset unavailable";
}

function getSettingsFields(
  mode: AppMode,
  settings: RuntimeSettings,
): Array<{ key: string; label: string; value: string }> {
  const base = [
    { key: "thinking", label: "Thinking", value: settings.thinking ? "on" : "off" },
    {
      key: "reasoningEffort",
      label: "Reasoning Effort",
      value: settings.reasoningEffort,
    },
    {
      key: "includeThoughts",
      label: "Include Thoughts",
      value: settings.includeThoughts ? "on" : "off",
    },
    { key: "maxRetries", label: "Max Retries", value: String(settings.maxRetries) },
    { key: "logs", label: "Logs", value: settings.logs ? "on" : "off" },
    { key: "verbose", label: "Verbose", value: settings.verbose ? "on" : "off" },
    {
      key: "routerMaxTurns",
      label: "Router Max Turns",
      value: String(settings.routerMaxTurns),
    },
    {
      key: "hybridMaxTurns",
      label: "Hybrid Max Turns",
      value: String(settings.hybridMaxTurns),
    },
  ];

  if (mode === "benchmark") {
    base.push(
      { key: "iterations", label: "Iterations", value: String(settings.iterations) },
      {
        key: "benchmarkStrategyScope",
        label: "Benchmark Strategies",
        value: settings.benchmarkStrategyScope,
      },
      {
        key: "benchmarkAllModels",
        label: "All Models",
        value: settings.benchmarkAllModels ? "yes" : "no",
      },
    );
  }

  return base;
}

function adjustSetting(
  mode: AppMode,
  key: string | undefined,
  direction: -1 | 1,
  setSelection: React.Dispatch<React.SetStateAction<SelectionState>>,
): void {
  if (!key) {
    return;
  }

  setSelection((prev) => {
    const current = prev.settings;
    const next = { ...current };

    if (key === "thinking") {
      next.thinking = !current.thinking;
    } else if (key === "includeThoughts") {
      next.includeThoughts = !current.includeThoughts;
    } else if (key === "logs") {
      next.logs = !current.logs;
    } else if (key === "verbose") {
      next.verbose = !current.verbose;
    } else if (key === "benchmarkAllModels") {
      next.benchmarkAllModels = !current.benchmarkAllModels;
    } else if (key === "reasoningEffort") {
      const order: ReasoningEffort[] = ["minimal", "low", "medium", "high"];
      const currentIndex = order.indexOf(current.reasoningEffort);
      const nextIndex = clamp(currentIndex + direction, 0, order.length - 1);
      next.reasoningEffort = order[nextIndex] ?? current.reasoningEffort;
    } else if (key === "benchmarkStrategyScope") {
      const order: BenchmarkStrategyScope[] = ["all", ...STRATEGIES];
      const currentIndex = order.indexOf(current.benchmarkStrategyScope);
      const nextIndex = clamp(currentIndex + direction, 0, order.length - 1);
      next.benchmarkStrategyScope = order[nextIndex] ?? current.benchmarkStrategyScope;
    } else if (key === "maxRetries") {
      next.maxRetries = clamp(current.maxRetries + direction, 0, 8);
    } else if (key === "routerMaxTurns") {
      next.routerMaxTurns = clamp(current.routerMaxTurns + direction, 1, 12);
    } else if (key === "hybridMaxTurns") {
      next.hybridMaxTurns = clamp(current.hybridMaxTurns + direction, 1, 12);
    } else if (key === "iterations" && mode === "benchmark") {
      next.iterations = clamp(current.iterations + direction, 1, 20);
    }

    return { ...prev, settings: next };
  });
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

function truncateForUi(value: string, max: number): string {
  if (value.length <= max) {
    return value;
  }
  return `${value.slice(0, Math.max(0, max - 1))}…`;
}

render(<App />);
