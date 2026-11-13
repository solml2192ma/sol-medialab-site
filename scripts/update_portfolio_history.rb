require 'open3'
require 'time'

def git(*args)
  output, status = Open3.capture2('git', *args)
  abort "Git history lookup failed: #{args.join(' ')}" unless status.success?
  output.force_encoding('UTF-8')
end

Dir.glob('_portfolio/*.md').each do |path|
  source = File.binread(path).force_encoding('UTF-8')
  header = source.match(/\A---\r?\n.*?\r?\n(?=---\r?\n)/m)
  next unless header

  history = git('log', '--follow', '--format=%an%x00%ae%x00%aI%x00%s%x00%(trailers:key=Portfolio-Metadata,valueonly,separator=%x20)', '--', path)
  records = history.lines.map { |line| line.chomp.split("\0", -1) }
  people = records.reject do |name, email, _, subject, metadata|
    name.end_with?('[bot]') || email.include?('[bot]') ||
      subject.start_with?('Auto-optimize newly uploaded portfolio photos') || metadata == 'true'
  end
  next if people.empty?

  name, _, date = people.first
  original = git('log', '--follow', '--diff-filter=A', '--format=%an', '--', path).lines.last&.strip
  eol = header[0].include?("\r\n") ? "\r\n" : "\n"
  values = {}
  values['post_author'] = original unless original.to_s.empty? || original.end_with?('[bot]')
  values['last_human_editor'] = name
  values['last_human_edit'] = Time.iso8601(date).getlocal('+09:00').iso8601
  updated = header[0].gsub(/^(?:#{values.keys.join('|')}):[^\r\n]*\r?\n/, '')
  values.compact.each { |key, value| updated << "#{key}: '#{value.gsub("'", "''")}'#{eol}" }
  result = updated + source[header.end(0)..]
  File.binwrite(path, result) unless result == source
end
