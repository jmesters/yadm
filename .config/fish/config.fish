# bun
set --export BUN_INSTALL "$HOME/.bun"
set --export PATH $BUN_INSTALL/bin $PATH

# gyb
set --export PATH /Users/jeromemesters/bin/gyb $PATH

eval "$(/opt/homebrew/bin/brew shellenv)"

zoxide init fish | source
fzf --fish | source
starship init fish | source

if status is-interactive
    fastfetch -c ~/.config/fastfetch/startup-message.jsonc --logo ~/.config/fastfetch/gpc-logo2
    atuin init fish | source
end

source ~/.safe-chain/scripts/init-fish.fish # Safe-chain Fish initialization script

# pnpm
set -gx PNPM_HOME "/Users/jeromemesters/Library/pnpm"
if not string match -q -- "$PNPM_HOME/bin" $PATH
  set -gx PATH "$PNPM_HOME/bin" $PATH
end
# pnpm end
