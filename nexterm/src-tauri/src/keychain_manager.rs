use keyring::Entry;

const SERVICE_NAME: &str = "novashell-ssh";

/// Build a consistent keyring key from connection details
fn make_key(connection_id: &str) -> String {
    format!("ssh-password-{}", connection_id)
}

/// Save a password to the system keychain
pub fn save_password(connection_id: &str, password: &str) -> Result<(), String> {
    let key = make_key(connection_id);
    let entry = Entry::new(SERVICE_NAME, &key)
        .map_err(|e| format!("Keychain entry error: {}", e))?;
    entry
        .set_password(password)
        .map_err(|e| format!("Keychain save error: {}", e))
}

/// Retrieve a password from the system keychain
pub fn get_password(connection_id: &str) -> Result<Option<String>, String> {
    let key = make_key(connection_id);
    let entry = Entry::new(SERVICE_NAME, &key)
        .map_err(|e| format!("Keychain entry error: {}", e))?;
    match entry.get_password() {
        Ok(password) => Ok(Some(password)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("Keychain read error: {}", e)),
    }
}

/// Delete a password from the system keychain
pub fn delete_password(connection_id: &str) -> Result<(), String> {
    let key = make_key(connection_id);
    let entry = Entry::new(SERVICE_NAME, &key)
        .map_err(|e| format!("Keychain entry error: {}", e))?;
    match entry.delete_password() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()), // Already gone, no problem
        Err(e) => Err(format!("Keychain delete error: {}", e)),
    }
}
