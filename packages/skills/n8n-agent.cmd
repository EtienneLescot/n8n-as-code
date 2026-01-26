@echo off

IF EXIST ".\node_modules\@n8n-as-code\skills\dist\cli.js" (
  node ".\node_modules\@n8n-as-code\skills\dist\cli.js" %*
  EXIT /B %ERRORLEVEL%
)

echo Error: @n8n-as-code/skills not found in node_modules
echo Please ensure it is installed as a dev dependency.
EXIT /B 1
