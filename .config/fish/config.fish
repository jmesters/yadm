if status is-interactive
    # Commands to run in interactive sessions can go here
end

# bun
set --export BUN_INSTALL "$HOME/.bun"
set --export PATH $BUN_INSTALL/bin $PATH

/opt/homebrew/bin/zoxide init fish | source
/opt/homebrew/bin/fzf --fish | source

eval "$(/opt/homebrew/bin/brew shellenv)"
