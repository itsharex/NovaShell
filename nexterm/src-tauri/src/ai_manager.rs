use serde::{Deserialize, Serialize};

const OLLAMA_URL: &str = "http://localhost:11434";

const MODEL_DOCS: &str = "llama3.2";

#[derive(Serialize, Deserialize, Clone)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Deserialize)]
struct OllamaChatResponse {
    message: Option<OllamaMessage>,
    error: Option<String>,
}

#[derive(Deserialize)]
struct OllamaMessage {
    content: String,
}

#[derive(Deserialize, Serialize, Clone)]
pub struct OllamaModel {
    pub name: String,
    pub size: u64,
}

#[derive(Deserialize)]
struct OllamaTagsResponse {
    models: Option<Vec<OllamaModel>>,
}

use std::sync::OnceLock;

static HTTP_CLIENT: OnceLock<reqwest::Client> = OnceLock::new();

fn client() -> &'static reqwest::Client {
    HTTP_CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(120))
            .pool_max_idle_per_host(2)
            .build()
            .unwrap_or_default()
    })
}

/// Check if Ollama is running
pub async fn check_health() -> Result<bool, String> {
    match client().get(OLLAMA_URL).send().await {
        Ok(r) => Ok(r.status().is_success()),
        Err(_) => Ok(false),
    }
}

/// List installed models
pub async fn list_models() -> Result<Vec<OllamaModel>, String> {
    let resp = client()
        .get(format!("{}/api/tags", OLLAMA_URL))
        .send()
        .await
        .map_err(|e| format!("Cannot connect to Ollama: {}", e))?;

    let parsed: OllamaTagsResponse = resp.json().await.map_err(|e| format!("Parse error: {}", e))?;
    Ok(parsed.models.unwrap_or_default())
}

/// Pull a model (blocking — waits for completion)
pub async fn pull_model(model: &str) -> Result<(), String> {
    let body = serde_json::json!({ "name": model, "stream": false });
    let resp = client()
        .post(format!("{}/api/pull", OLLAMA_URL))
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Pull request failed: {}", e))?;

    if !resp.status().is_success() {
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("Pull failed: {}", text));
    }
    // Wait for response body (pull completes when response is received with stream:false)
    let _ = resp.text().await;
    Ok(())
}

/// Chat with a model
pub async fn chat(
    model: &str,
    system_prompt: &str,
    messages: &[ChatMessage],
) -> Result<String, String> {
    let mut api_messages = Vec::with_capacity(messages.len() + 1);
    api_messages.push(serde_json::json!({
        "role": "system",
        "content": system_prompt
    }));
    for m in messages {
        api_messages.push(serde_json::json!({
            "role": m.role,
            "content": m.content
        }));
    }

    let body = serde_json::json!({
        "model": model,
        "messages": api_messages,
        "stream": false,
        "options": {
            "temperature": 0.3,
            "num_predict": 2048
        }
    });

    let resp = client()
        .post(format!("{}/api/chat", OLLAMA_URL))
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Ollama request failed: {}", e))?;

    let status = resp.status();
    let text = resp.text().await.map_err(|e| format!("Read error: {}", e))?;

    if !status.is_success() {
        return Err(format!("Ollama error ({}): {}", status, &text[..text.len().min(300)]));
    }

    let parsed: OllamaChatResponse =
        serde_json::from_str(&text).map_err(|e| format!("Parse error: {}", e))?;

    if let Some(err) = parsed.error {
        return Err(err);
    }
    parsed
        .message
        .map(|m| m.content)
        .ok_or_else(|| "No response from model".to_string())
}

// ──────────── Session Documentation ────────────

pub async fn generate_session_doc(
    commands: &[String],
    errors: &[String],
    duration_minutes: u64,
) -> Result<String, String> {
    let prompt = format!(
        r#"Generate a clear, professional session documentation in markdown format for a terminal session.

## Session Data:
- Duration: {} minutes
- Commands executed ({} total):
{}

{}

## Instructions:
- Write a concise summary of what was accomplished
- Group related commands into logical sections
- Highlight any errors and how they were resolved (if applicable)
- Use proper markdown formatting with headers, code blocks, and bullet points
- Include a "Commands Reference" section with the key commands used
- Write in the same language as the commands/errors suggest (English by default)
- Keep it professional and useful for future reference"#,
        duration_minutes,
        commands.len(),
        commands
            .iter()
            .enumerate()
            .map(|(i, c)| format!("{}. `{}`", i + 1, c))
            .collect::<Vec<_>>()
            .join("\n"),
        if errors.is_empty() {
            "No errors during session.".to_string()
        } else {
            format!(
                "Errors encountered ({}):\n{}",
                errors.len(),
                errors
                    .iter()
                    .map(|e| format!("- {}", e))
                    .collect::<Vec<_>>()
                    .join("\n")
            )
        }
    );

    let messages = vec![ChatMessage {
        role: "user".to_string(),
        content: prompt,
    }];

    chat(
        MODEL_DOCS,
        "You are a technical documentation expert. Generate clean, well-structured markdown documentation for terminal sessions. Be concise but thorough.",
        &messages,
    )
    .await
}
